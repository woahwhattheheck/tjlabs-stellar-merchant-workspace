// Complete original-source preparation and native Workshare/Installation handover.
import {Sha256, sha256File} from './operations_installation_source_hash.mjs';
import {bindingTemplate, prepareInstallation, renderWorkorder} from './installation-prepare-core.mjs';

const SCHEMA='stellar-forge.installation-source-desk.v1';
const SELECTION='stellar-forge.installation-source-selection.v1';
const MAX_FILE=8*1024*1024, MAX_ARCHIVE=192*1024*1024;
const clone=value=>structuredClone(value);
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const sorted=value=>Array.isArray(value)?value.map(sorted):record(value)?
  Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])])):value;
const stable=value=>JSON.stringify(sorted(value));
const equal=(a,b)=>stable(a)===stable(b);
const utf8=value=>new TextEncoder().encode(value);
const hash=value=>new Sha256().update(typeof value==='string'?utf8(value):value).hex();
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pretty=value=>JSON.stringify(value,null,2)+'\n';
const decimalText=/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const filenameOK=/^[A-Za-z0-9][A-Za-z0-9_.-]{0,199}$/;
const finiteJSON=value=>{
  if(typeof value==='number'&&!Number.isSafeInteger(value))throw new Error('Keep exact decimal amounts as text and whole counts within their native integer range.');
  if(value&&typeof value==='object')for(const item of Object.values(value))finiteJSON(item);
  return value;
};
function parseObject(value,label){
  let result;try{result=JSON.parse(value);}catch{throw new Error(label+' must contain the complete JSON object.');}
  if(!record(result))throw new Error(label+' must contain an object.');
  return finiteJSON(result);
}
const btn=(label,action,attrs='',disabled=false)=>'<button type="button" data-source-action="'+action+'" '+attrs+
  (disabled?' disabled data-source-fixed="true"':'')+'>'+esc(label)+'</button>';
const empty=text=>'<p class="source-desk-empty">'+esc(text)+'</p>';
const hint=text=>'<p class="source-desk-hint">'+esc(text)+'</p>';
const table=(heads,rows)=>'<div class="source-desk-table"><table><thead><tr>'+heads.map(v=>'<th scope="col">'+esc(v)+'</th>').join('')+
  '</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(v=>'<td>'+v+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
function field(label,path,value='',options={}){
  const a=' data-source-field="'+esc(path)+'"'+(options.readonly?' readonly':' data-source-edit');
  let input;
  if(options.options)input='<select'+a+'>'+options.options.map(([v,label])=>'<option value="'+esc(v)+'"'+(String(value??'')===String(v)?' selected':'')+'>'+esc(label)+'</option>').join('')+'</select>';
  else if(options.area)input='<textarea'+a+' rows="'+(options.rows||4)+'" spellcheck="false">'+esc(value)+'</textarea>';
  else input='<input'+a+' type="'+(options.type||'text')+'" value="'+esc(value)+'"'+(options.list?' list="'+esc(options.list)+'"':'')+'>';
  return '<label class="'+(options.wide?'source-desk-wide':'')+'"><span>'+esc(label)+'</span>'+input+
    (options.help?'<small>'+esc(options.help)+'</small>':'')+'</label>';
}
function setPath(object,path,value){
  const bits=path.split('.');let current=object;
  for(const bit of bits.slice(0,-1)){
    if(!Object.hasOwn(current,bit)||current[bit]===null)current[bit]={};
    current=current[bit];
  }
  current[bits.at(-1)]=value;
}
function base64(raw){
  let binary='';for(let i=0;i<raw.length;i+=32768)binary+=String.fromCharCode(...raw.subarray(i,i+32768));
  return btoa(binary);
}
function downloadBlob(raw,name,type='application/json'){
  const blob=raw instanceof Blob?raw:new Blob([raw],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
function originalFile(row){
  return {path:row.filename,...Object.fromEntries(['filename','bytes','sha256','mediaType','sourceUrl','observedAt'].map(k=>[k,row[k]]))};
}

class BrowserJournal{
  constructor(key){this.key=key;this.closed=false;this.opening=new Promise((resolve,reject)=>{
    let rejected=false;
    const fail=error=>{rejected=true;reject(error);};
    const request=indexedDB.open('sf47.installation-source-desk',1);
    request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('records'))db.createObjectStore('records');};
    request.onsuccess=()=>{if(rejected){request.result.close();return;}
      request.result.onversionchange=()=>request.result.close();resolve(request.result);};
    request.onerror=()=>fail(request.error||new Error('The browser draft journal is unavailable.'));
    request.onblocked=()=>fail(new Error('Close the older preparation desk before upgrading its browser journal.'));
  });}
  async access(mode,action){
    if(this.closed)throw new Error('The original browser journal is closed.');
    const db=await this.opening;
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('records',mode),store=tx.objectStore('records');let result;
      try{const request=action(store);request.onsuccess=()=>{result=request.result;};request.onerror=()=>tx.abort();}
      catch(error){tx.abort();reject(error);return;}
      tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(tx.error||new Error('The complete browser journal write failed.'));
      tx.onerror=()=>{};
    });
  }
  get(name){return this.access('readonly',s=>s.get(this.key+':'+name));}
  put(name,value){return this.access('readwrite',s=>s.put(clone(value),this.key+':'+name));}
  async close(){if(this.closed)return;const db=await this.opening;db.close();this.closed=true;}
}

/** Bridge borrows the original authenticated API and original installation editor. */
export function mountInstallationSources(root,bridge){
  root.classList.add('source-desk');root.setAttribute('aria-label','Installation source preparation');
  if(!document.querySelector('link[data-installation-source-style]')){
    const link=document.createElement('link');link.rel='stylesheet';link.href='/operations_installation_sources.css';
    link.dataset.installationSourceStyle='true';document.head.append(link);
  }
  const context=bridge.context(),scope={caseId:context.caseId,planId:context.planId,createdAt:context.createdAt},caseId=scope.caseId,prefix='/api/operations/'+caseId+'/installation-sources';
  const journal=new BrowserJournal(caseId+':'+scope.planId+':'+scope.createdAt);
  const initial={schema:SCHEMA,scope,open:false,tab:'files',draftId:null,revision:null,work:null,note:'',newTitle:'',
    upload:{filename:'',mediaType:'application/json',sourceUrl:'',observedAt:''},
    caseForm:null,pendingId:null,preparationId:null,profileWork:null,
    inspectionFileId:null,notice:'',error:'',rejected:[]};
  let state=clone(initial),alive=true,busy=false,hostBusy=false,initialized=false;
  let saved=null,edition=null,heads=[],catalogue=null,prepared=null,inspection=null,request=null,chosenFile=null;
  let generation=0,persistedGeneration=0,persistence=Promise.resolve(),timer=null,storageError='',downloads=new Set();
  const inspectors=new Map(),owned=new Set(),$=q=>root.querySelector(q),available=()=>alive&&root.isConnected;
  let closing=null,disposePersistenceAttempted=false,disposePersistenceError=null;
  function own(promise){owned.add(promise);promise.then(()=>owned.delete(promise),()=>owned.delete(promise));return promise;}
  const current=()=>bridge.context();
  const readonly=()=>hostBusy||!!bridge.readOnlyReason?.();
  const historic=()=>saved&&state.revision!==null&&state.revision!==saved.revision;
  const workingDirty=()=>!!state.work?.dirty||!!state.caseForm?.dirty||!!state.profileWork?.dirty;
  const pending=()=>!!state.pendingId;
  const editing=()=>initialized&&!busy&&!pending()&&!readonly()&&!historic();
  function snapshot(){return clone(state);}
  function persistNow(){
    clearTimeout(timer);timer=null;const value=snapshot(),version=generation;
    persistence=persistence.catch(()=>{}).then(()=>journal.put('working',value)).then(()=>{
      persistedGeneration=Math.max(persistedGeneration,version);storageError='';
    }).catch(error=>{storageError=error.message||String(error);throw error;});
    return persistence;
  }
  function changed(){
    generation++;clearTimeout(timer);timer=setTimeout(()=>{persistNow().catch(()=>{if(available())status();});},180);
    controls();
  }
  function status(){
    const target=$('[data-source-status]');if(target){target.textContent=storageError||state.error||state.notice;
      target.setAttribute('role',storageError||state.error?'alert':'status');}
  }
  function controls(){
    if(!available())return;
    root.setAttribute('aria-busy',String(busy||hostBusy));
    for(const node of root.querySelectorAll('button,input,textarea,select')){
      const action=node.dataset.sourceAction;
      const liveDisabled={
        'save-selection':!saved||historic()||!state.work?.dirty,
        'prepare':!saved?.selection||!!state.work?.dirty||!!state.caseForm?.dirty||historic(),
        'profile-apply':!state.profileWork?.preview||state.profileWork.previewBindings!==state.profileWork.bindingsText,
        'profile-download':!state.profileWork?.prepared||state.profileWork.previewBindings!==state.profileWork.bindingsText
      };
      node.disabled=(Object.hasOwn(liveDisabled,action)?liveDisabled[action]:node.dataset.sourceFixed==='true')||busy||hostBusy||
        (node.matches('[data-source-edit]')&&!editing())||
        (!!state.pendingId&&['new','upload','remove','save-selection','prepare','attach','case-add','case-remove','case-new','case-edit','profile-seed','profile-apply'].includes(action));
    }
  }
  function checkContext(){
    const next=current();
    if(next.caseId!==scope.caseId||next.planId!==scope.planId||next.createdAt!==scope.createdAt)
      throw new Error('Reopen this complete preparation in its original operating case.');
  }
  function requireEdit(){
    checkContext();
    if(readonly())throw new Error(bridge.readOnlyReason?.()||'The operating workspace is currently busy.');
    if(pending())throw new Error('Recover the original preparation request before starting another mutation.');
    if(historic())throw new Error('Open the current draft before editing. The historical edition remains downloadable.');
    if(!saved)throw new Error('Create or open an original source preparation first.');
    if(workingDirty()&&state.work?.baseRevision!==saved.revision)
      throw new Error('The saved source draft advanced. Review both complete selections and reconcile your retained mapping before editing.');
  }
  async function run(fn){
    if(!available()||busy||hostBusy)return;
    busy=true;state.error='';controls();
    try{return await own(Promise.resolve().then(fn));}
    catch(error){state.error=error.message||String(error);changed();}
    finally{busy=false;if(available())render();}
  }
  async function refreshHeads(){
    const value=await bridge.api(prefix);
    if(value.schema!==SCHEMA||value.caseId!==caseId||!Array.isArray(value.drafts))
      throw new Error('The source-draft list differs from its original case.');
    heads=value.drafts;return value;
  }
  async function readCatalogue(){
    const value=await bridge.api('/api/operations/installation-source-profiles');
    if(value.schema!==SCHEMA||!value.engine?.sha256||!Array.isArray(value.profiles))
      throw new Error('Retain the complete installed preparation/profile catalogue.');
    catalogue=value;return value;
  }
  function acceptState(value,{replace=false}={}){
    if(value.schema!==SCHEMA||value.caseId!==caseId||value.id!==state.draftId||!Number.isSafeInteger(value.revision))
      throw new Error('The source draft changed original case or edition.');
    saved=value;edition=value;
    if(replace||!state.work||state.work.draftId!==value.id){
      state.work={draftId:value.id,baseRevision:value.revision,selectionText:value.selection?pretty(value.selection):'',dirty:false};
      state.caseForm=null;state.profileWork=null;
    }else if(!workingDirty()){
      state.work.baseRevision=value.revision;state.work.selectionText=value.selection?pretty(value.selection):'';
    }
    state.revision=null;
  }
  async function openDraft(id,revision=null,force=false){
    if(pending())throw new Error('Recover the original request before replacing its source draft or selected revision.');
    if(!force&&workingDirty()&&!confirm('Keep the saved history and replace the current unsaved preparation fields?'))return;
    const epoch=++generation;
    const latest=await bridge.api(prefix+'/'+id);
    const value=revision===null||revision===latest.revision?latest:await bridge.api(prefix+'/'+id+'?revision='+revision);
    if(!available()||epoch!==generation)return;
    state.draftId=id;acceptState(latest,{replace:true});
    if(value.revision!==latest.revision){
      state.revision=value.revision;
      state.work={draftId:id,baseRevision:value.revision,selectionText:value.selection?pretty(value.selection):'',dirty:false};
    }
    edition=value;state.preparationId=value.preparations.at(-1)?.id??null;
    state.tab='files';inspection=null;prepared=null;inspectors.clear();chosenFile=null;state.inspectionFileId=null;
    state.notice=revision===null?'Opened complete source preparation revision '+latest.revision+'.':'Opened retained revision '+value.revision+'.';
    await persistNow();
    if(state.preparationId)await readPreparation(state.preparationId);
  }
  function selectedDraft(){return edition||saved;}
  async function viewEdition(){return selectedDraft();}
  async function createDraft(){
    if(pending())throw new Error('Recover the original source request first.');
    if(workingDirty()&&!confirm('Keep the saved history and replace the current unsaved preparation fields?'))return;
    const title=state.newTitle.trim();
    if(!title)throw new Error('Name this complete source preparation.');
    const id='source-desk-'+crypto.randomUUID().replaceAll('-','');
    state.draftId=id;state.work=null;state.caseForm=null;state.profileWork=null;state.revision=null;saved=null;
    return issue('create',{title},0);
  }
  function verifyReceipt(value,original){
    if(value.schema!==SCHEMA||value.requestId!==original.body.requestId||
       value.requestSha256!==original.requestSha256||value.draft?.caseId!==caseId||value.draft.id!==original.draftId)
      throw new Error('The returned preparation receipt differs from the complete original request.');
    return value;
  }
  async function adoptReceipt(value,original){
    verifyReceipt(value,original);
    original.receipt=clone(value);original.state='RECORDED';original.recordedAt=new Date().toISOString();
    await journal.put('request:'+original.body.requestId,original);
    if(state.pendingId!==original.body.requestId)throw new Error('Retain the original pending request before adopting its result.');
    const beforeWork=state.work;
    state.pendingId=null;request=null;state.notice='Saved complete source preparation revision '+value.draft.revision+'.';
    if(state.draftId===value.draft.id){
      const newer=beforeWork?.dirty&&original.editorText!==beforeWork.selectionText;
      acceptState(value.draft,{replace:!newer&&original.body.action==='selection.save'});
      if(newer){state.work=beforeWork;state.work.baseRevision=value.draft.revision;}
      else if(state.work)state.work.baseRevision=value.draft.revision;
    }
    if(value.result?.state==='PREPARED_SOURCE'){
      prepared=value.result;state.preparationId=prepared.id;state.tab='outputs';
      state.notice='Prepared every original document and the complete native receiving package.';
    }
    if(value.result?.state==='ATTACHED_SOURCES'){
      state.tab='installation';state.notice='Attached the complete prepared cohort to the original case in one transaction.';
    }
    changed();
    try{await persistNow();}catch(error){state.pendingId=original.body.requestId;request=original;throw error;}
    // Once both the receipt and working selection are durable, a failed read is
    // readback only. It never changes a recorded original POST into a new request.
    try{
      await refreshHeads();
      if(value.result?.state==='ATTACHED_SOURCES'){
        await bridge.refreshCase();
        if(available())await readPreparation(value.result.preparationId);
      }
    }catch(error){state.error='Saved original request; refresh its current case to finish readback. '+(error.message||String(error));changed();}
    return value;
  }
  async function issue(action,data,expected=saved?.revision){
    checkContext();
    if(readonly())throw new Error(bridge.readOnlyReason?.()||'The operating workspace is busy.');
    if(pending())throw new Error('Recover the original request before recording another change.');
    if(action!=='create')requireEdit();
    const body={requestId:'source-'+crypto.randomUUID(),expectedRevision:expected,
      actor:bridge.recordingActor(),note:state.note,action,data:clone(data)};
    if(!body.actor?.trim())throw new Error('Enter the recording operator in the original workspace.');
    const original={schema:SCHEMA,caseId,draftId:state.draftId,body,createdAt:new Date().toISOString(),
      requestSha256:hash(stable({schema:SCHEMA,caseId,draftId:state.draftId,body})),
      editorText:state.work?.selectionText??null,state:'PREPARED'};
    // Full upload and request bytes must be retained before their first POST.
    await journal.put('request:'+body.requestId,original);
    state.pendingId=body.requestId;request=original;changed();await persistNow();
    return sendOriginal(original);
  }
  async function sendOriginal(original=request){
    if(!original||state.pendingId!==original.body.requestId||original.caseId!==caseId||original.draftId!==state.draftId)
      throw new Error('Reopen the complete original pending request.');
    if(hash(stable({schema:SCHEMA,caseId,draftId:original.draftId,body:original.body}))!==original.requestSha256)
      throw new Error('The retained original request bytes changed.');
    checkContext();
    if(original.receipt)return adoptReceipt(original.receipt,original);
    let value;
    try{value=await bridge.saveApi(prefix+'/'+original.draftId,clone(original.body));}
    catch(error){
      original.lastError={message:error.message||String(error),code:error.code??null,status:error.status??null,
        definitive:[400,401,403,404,409,413,422].includes(error.status)&&typeof error.code==='string',at:new Date().toISOString()};
      original.state='UNRESOLVED';request=original;await journal.put('request:'+original.body.requestId,original);throw error;
    }
    return adoptReceipt(value,original);
  }
  async function readOriginal(){
    const original=request;if(!original)throw new Error('No original request is pending.');
    const value=await bridge.saveApi(prefix+'/'+original.draftId+'/requests/'+original.body.requestId);
    if(value.schema!==SCHEMA||value.requestId!==original.body.requestId)throw new Error('The original request status changed identity.');
    if(value.state==='RECORDED')return adoptReceipt(value.result,original);
    if(value.state!=='NOT_RECORDED')throw new Error('The original request has no recognized complete status.');
    original.statusRead={state:value.state,at:new Date().toISOString()};await journal.put('request:'+original.body.requestId,original);
    state.notice='The original request is not recorded. Retry that same request, or reconcile its definite rejection.';return value;
  }
  async function retireRejected(){
    if(!request?.lastError?.definitive)throw new Error('Keep an uncertain original request selected for reconciliation.');
    const original=request,status=await readOriginal();if(status?.state!=='NOT_RECORDED')return;
    original.state='REJECTED';await journal.put('request:'+original.body.requestId,original);
    state.rejected.push({requestId:original.body.requestId,action:original.body.action,code:original.lastError.code});
    state.pendingId=null;request=null;changed();await persistNow();
    if(saved){const current=await bridge.api(prefix+'/'+saved.id);saved=current;edition=current;}
    state.notice='Kept the rejected original request. Your complete edited selection remains available for reconciliation.';
  }
  async function upload(){
    requireEdit();
    const file=chosenFile,metadata=clone(state.upload);
    if(!file||file.size<1||file.size>MAX_FILE)throw new Error('Choose one complete original file up to 8 MiB.');
    if(!filenameOK.test(metadata.filename))throw new Error('Use a receiving filename with letters, numbers, dots, underscores or hyphens.');
    const epoch=generation,raw=new Uint8Array(await file.arrayBuffer());
    if(file!==chosenFile||epoch!==generation||raw.length!==file.size)throw new Error('The selected original upload changed. Choose it again.');
    return issue('file.add',{...metadata,bytes:raw.length,sha256:hash(raw),contentBase64:base64(raw)});
  }
  async function saveSelection(){
    requireEdit();if(state.caseForm?.dirty)throw new Error('Apply the edited customer mapping to the complete selection first.');
    const selection=parseObject(state.work?.selectionText||'','Complete source selection');
    if(selection.schema!==SELECTION)throw new Error('Use the native complete source selection schema.');
    return issue('selection.save',{selection});
  }
  async function prepare(){
    requireEdit();
    if(state.work?.dirty||state.caseForm?.dirty)throw new Error('Save the complete edited source selection before native preparation.');
    if(!saved.selection)throw new Error('Save the complete native source mapping first.');
    const selected=clone(saved.selection),profiles={};
    await readCatalogue();
    for(const row of selected.cases||[]){
      const profile=catalogue.profiles.find(p=>p.id===row.profile);
      if(!profile)throw new Error('Select an installed profile for every original customer.');
      profiles[profile.id]=profile.sha256;
    }
    return issue('prepare',{expectedEngineSha256:catalogue.engine.sha256,expectedSelectionSha256:hash(stable(selected)),expectedProfiles:profiles});
  }
  async function readPreparation(id){
    const value=await bridge.api(prefix+'/'+state.draftId+'/preparations/'+id);
    if(value.schema!=='stellar-forge.installation-source-desk-preparation.v1'||value.caseId!==caseId||value.draftId!==state.draftId||value.id!==id)
      throw new Error('The complete preparation belongs to another original selection.');
    prepared=value;state.preparationId=id;return value;
  }
  async function attach(){
    requireEdit();if(!prepared)throw new Error('Open a complete preparation first.');
    await bridge.refreshCase();
    return issue('attach',{preparationId:prepared.id,expectedSelectionSha256:prepared.selectionSha256,expectedVersion:current().version});
  }
  async function download(path,receipt){
    if(!Number.isSafeInteger(receipt.bytes)||receipt.bytes<0||receipt.bytes>MAX_ARCHIVE||!/^[a-f0-9]{64}$/.test(receipt.sha256))
      throw new Error('Keep the complete original file receipt.');
    const controller=new AbortController();downloads.add(controller);
    let reader,writer,published=false;
    try{
      if(typeof window.showSaveFilePicker==='function'){
        try{
          const handle=await window.showSaveFilePicker({suggestedName:receipt.filename});
          writer=await handle.createWritable({keepExistingData:false});
        }catch(error){if(error.name==='AbortError')return;
          if(!['SecurityError','NotAllowedError'].includes(error.name))throw error;}
      }
      const response=await bridge.api(path,undefined,{download:true,signal:controller.signal});
      if(response.headers.get('content-length')!==String(receipt.bytes))throw new Error('The complete download length differs from the original selection.');
      reader=response.body.getReader();const checksum=new Sha256(),parts=[];let count=0;
      while(true){if(controller.signal.aborted||!alive)throw new Error('The original download was interrupted.');
        const {done,value}=await reader.read();if(done)break;
        count+=value.length;if(count>receipt.bytes)throw new Error('The download exceeds the original complete file.');
        checksum.update(value);if(writer)await writer.write(value);else parts.push(value);
      }
      if(controller.signal.aborted||!alive)throw new Error('The original download was interrupted.');
      if(count!==receipt.bytes||checksum.hex()!==receipt.sha256)throw new Error('The downloaded bytes differ from the complete original SHA-256.');
      if(writer)await writer.close();else downloadBlob(new Blob(parts,{type:receipt.mediaType}),receipt.filename);
      published=true;state.notice='Downloaded the complete '+receipt.filename+' ('+receipt.bytes+' verified bytes).';
    }finally{
      if(writer&&!published)await writer.abort().catch(()=>{});
      if(reader){await reader.cancel().catch(()=>{});reader.releaseLock();}
      controller.abort();downloads.delete(controller);
    }
  }

  const files=()=>selectedDraft()?.files||[];
  const revisionQuery=()=>state.revision===null?'':'revision='+state.revision+'&';
  function blankSelection(){
    const suffix=state.draftId?.replace(/^source-desk-/,'')||'unselected';
    return {schema:SELECTION,operationId:'source-preparation-'+suffix,requestPrefix:'installation-'+suffix,
      receivingName:'',sourceUrl:'',observedAt:'',cases:[]};
  }
  function selectionValue(){
    const value=state.work?.selectionText?.trim()?parseObject(state.work.selectionText,'Complete source selection'):blankSelection();
    if(value.schema!==SELECTION||!Array.isArray(value.cases))throw new Error('Keep the complete native selection and customer cases.');
    return value;
  }
  function keepSelection(value){
    state.work={...state.work,draftId:state.draftId,baseRevision:state.work?.baseRevision??saved.revision,
      selectionText:pretty(value),dirty:true};
    prepared=null;state.preparationId=null;changed();
  }
  function replaceFormAllowed(form){
    return !form?.dirty||confirm('Keep the complete saved selection and replace these unsaved mapping fields?');
  }
  async function inspectFile(fileId,amendment=null){
    const file=files().find(f=>f.id===fileId);if(!file)throw new Error('Select a complete original file in this draft edition.');
    const key=file.id+':'+(state.revision??saved.revision)+':'+stable(amendment);
    if(inspectors.has(key))return inspectors.get(key);
    const value=amendment===null?await bridge.api(prefix+'/'+state.draftId+'/files/'+fileId+'/inspect?'+revisionQuery().replace(/&$/,'')):
      await bridge.api(prefix+'/'+state.draftId+'/files/'+fileId+'/inspect',{revision:state.revision,phaseIdAmendment:amendment});
    if(value.schema!==SCHEMA||value.file.id!==file.id||value.file.sha256!==file.sha256||value.file.bytes!==file.bytes||
       hash(value.jsonText)!==file.sha256||utf8(value.jsonText).length!==file.bytes||!equal(value.phaseAmendment,amendment))
      throw new Error('The native source inspection differs from the complete selected original.');
    inspectors.set(key,value);if(inspectors.size>3)inspectors.delete(inspectors.keys().next().value);
    return value;
  }
  async function openInspection(fileId){
    const value=await inspectFile(fileId);
    inspection=value;state.inspectionFileId=fileId;changed();
  }
  function emptyCase(){
    return {index:null,caseId:'',profile:'',packetId:'',fileIds:[],phaseRows:[],
      total:{hours:'',sourcePointer:'',sourceFile:'',unit:'hours'},
      amendmentText:'',bindingsText:'',packet:null,reviewedAmendment:null,dirty:false,earlierPhaseRows:[]};
  }
  async function editCase(index=null){
    requireEdit();
    if(!replaceFormAllowed(state.caseForm))return;
    const selected=selectionValue(),row=index===null?null:selected.cases[index],form=emptyCase();
    if(index!==null&&!row)throw new Error('Select the original mapped customer row.');
    if(row){
      form.index=index;form.caseId=row.caseId;form.profile=row.profile;
      form.packetId=files().find(f=>f.filename===row.packet.filename&&f.sha256===row.packet.sha256)?.id??'';
      form.fileIds=row.files.map(x=>files().find(f=>f.filename===x.filename&&f.sha256===x.sha256)?.id).filter(Boolean);
      form.phaseRows=clone(row.productionEffort||[]).map(x=>({...x,sourceFile:x.sourceFile??''}));
      form.total={...clone(row.effortTotal||{}),sourceFile:row.effortTotal?.sourceFile??''};
      form.amendmentText=row.phaseIdAmendment?pretty(row.phaseIdAmendment):'';
      form.bindingsText=row.bindings?pretty(row.bindings):'';
    }
    state.caseForm=form;state.tab='mapping';changed();
    if(form.packetId)await reviewPacket();
  }
  async function reviewPacket(){
    requireEdit();const form=state.caseForm;
    if(!form?.packetId)throw new Error('Choose the original complete Workshare packet.');
    const amendment=form.amendmentText.trim()?parseObject(form.amendmentText,'Explicit phase-ID amendment'):null;
    const epoch=generation,fingerprint=stable({packetId:form.packetId,amendment});
    const value=await inspectFile(form.packetId,amendment);
    if(!available()||epoch!==generation||form!==state.caseForm||
       fingerprint!==stable({packetId:form.packetId,amendment:form.amendmentText.trim()?parseObject(form.amendmentText,'Phase amendment'):null}))return;
    if(!value.packet||!Array.isArray(value.packet.plan.phases))throw new Error('This complete JSON file has no original Workshare plan/phases.');
    const previous=form.phaseRows,byId=new Map(previous.map(x=>[x.phaseId,x]));
    form.earlierPhaseRows=previous.filter(x=>!value.packet.plan.phases.some(p=>p.id===x.phaseId));
    form.phaseRows=value.packet.plan.phases.map(p=>byId.get(p.id)||{phaseId:p.id,hours:'',sourcePointer:'',sourceFile:'',unit:'hours',basis:''});
    form.packet=clone(value.packet);form.reviewedAmendment=clone(amendment);form.amendmentReceipt=clone(value.phaseAmendmentReceipt);
    if(!form.caseId&&value.packet.caseId)form.caseId=value.packet.caseId;
    form.dirty=true;inspection=value;state.inspectionFileId=form.packetId;changed();
    state.notice='Opened all '+form.phaseRows.length+' original phases. Select the exact source pointer for every assigned effort.';
  }
  function effortRow(row,phase=false){
    if(!decimalText.test(row.hours??''))throw new Error('Enter exact nonnegative decimal hours for every original effort.');
    if(typeof row.sourcePointer!=='string'||!row.sourcePointer.startsWith('/'))throw new Error('Select an exact JSON pointer for each original effort value.');
    if(!['hours','minutes'].includes(row.unit))throw new Error('Select the original effort unit.');
    const result={...(phase?{phaseId:row.phaseId}:{}),hours:row.hours,sourcePointer:row.sourcePointer,unit:row.unit};
    if(row.sourceFile){
      if(!files().some(f=>f.filename===row.sourceFile))throw new Error('Keep each effort pointer linked to a retained full source file.');
      result.sourceFile=row.sourceFile;
    }
    if(phase){if(!row.basis?.trim())throw new Error('Explain the original basis for each phase effort.');result.basis=row.basis;}
    return result;
  }
  function applyCase(){
    requireEdit();const form=state.caseForm;
    if(!form?.packet||!form.caseId.trim()||!form.profile)throw new Error('Review the complete original packet, case ID and installed profile first.');
    const amendment=form.amendmentText.trim()?parseObject(form.amendmentText,'Explicit phase amendment'):null;
    if(!equal(amendment,form.reviewedAmendment))throw new Error('Review the edited phase amendment against the original packet before applying it.');
    const packet=files().find(f=>f.id===form.packetId),selected=selectionValue();
    if(!packet||!catalogue.profiles.some(x=>x.id===form.profile))throw new Error('Select the complete retained packet and installed profile.');
    const selectedFiles=[...new Set(form.fileIds)].filter(id=>id!==packet.id).map(id=>{
      const f=files().find(x=>x.id===id);if(!f)throw new Error('A selected original document is absent.');return originalFile(f);
    });
    const declared=new Set([packet.filename,...selectedFiles.map(x=>x.filename)]);
    const phases=form.phaseRows.map(x=>effortRow(x,true)),total=effortRow(form.total);
    for(const x of [...phases,total])if(x.sourceFile&&!declared.has(x.sourceFile))
      throw new Error('Include the complete '+x.sourceFile+' document selected by an effort pointer.');
    const row={caseId:form.caseId,profile:form.profile,packet:originalFile(packet),planSha256:form.packet.planSha256,
      productionEffort:phases,effortTotal:total,files:selectedFiles};
    if(amendment)row.phaseIdAmendment=amendment;
    if(form.bindingsText.trim())row.bindings=parseObject(form.bindingsText,'Complete native bindings');
    if(selected.cases.some((x,i)=>x.caseId===row.caseId&&i!==form.index))throw new Error('Keep each original customer case once in this complete selection.');
    if(form.index===null)selected.cases.push(row);else selected.cases[form.index]=row;
    keepSelection(selected);state.caseForm=null;state.notice='Applied all original phases and document bindings to the complete editable selection.';
  }
  function removeCase(index){
    requireEdit();const selected=selectionValue(),row=selected.cases[index];
    if(!row||!confirm('Remove '+row.caseId+' from this working selection? Earlier saved editions remain retained.'))return;
    selected.cases.splice(index,1);keepSelection(selected);state.caseForm=null;
  }
  async function inspectPointerSource(index){
    const form=state.caseForm,row=index==='total'?form?.total:form?.phaseRows[Number(index)];
    if(!row)throw new Error('Select the original effort row.');
    const f=row.sourceFile?files().find(f=>f.filename===row.sourceFile):files().find(f=>f.id===form.packetId);
    if(!f)throw new Error('Select the original complete source for this effort.');
    const value=await inspectFile(f.id,row.sourceFile?null:form.reviewedAmendment);
    inspection=value;state.inspectionFileId=f.id;state.pointerTarget={index,sourceFile:row.sourceFile??'',basis:row.sourceFile?'file':'plan'};changed();
  }
  function choosePointer(index){
    requireEdit();const target=state.pointerTarget,item=inspection?.numericCandidates[index],form=state.caseForm;
    if(!target||!item||item.basis!==target.basis||!form)throw new Error('Open the exact effort source before choosing its pointer.');
    const row=target.index==='total'?form.total:form.phaseRows[Number(target.index)];
    if(!row||row.sourceFile!==target.sourceFile)throw new Error('The selected effort source changed.');
    row.sourcePointer=item.pointer;form.dirty=true;changed();
    state.notice='Selected the original value '+item.text+'. Enter its explicit assigned hours and original unit; native preparation checks the exact conversion.';
  }
  function latestAttachment(){
    return [...(saved?.attachments||[])].reverse().find(a=>!state.preparationId||a.preparationId===state.preparationId)??null;
  }
  async function openInstallation(){
    requireEdit();
    const attachment=latestAttachment();if(!attachment)throw new Error('Attach one complete preparation to this operating case first.');
    await bridge.refreshCase();
    const selection={...clone(attachment.selection),expectedVersion:current().version};
    const inventory=await bridge.api('/api/operations/'+caseId+'/installation-workshares',selection);
    if(inventory.source?.caseId!==undefined&&inventory.source.caseId!==caseId)throw new Error('The native Workshare selection belongs to another case.');
    if(!Array.isArray(inventory.cases))throw new Error('Retain the complete attached Workshare inventory.');
    if(state.profileWork?.dirty){
      state.notice='Kept your edited profile bindings. Review their original source before replacing them.';
      state.tab='installation';changed();return;
    }
    state.profileWork={attachmentId:attachment.preparationId,selection,inventory,
      workshareCaseId:inventory.cases[0]?.caseId??'',profileId:'',bindingsText:'',seed:null,
      profileSha256:null,prepared:null,preview:null,dirty:false};
    const mapping=saved.selection?.cases.find(x=>x.caseId===state.profileWork.workshareCaseId);
    if(mapping)state.profileWork.profileId=mapping.profile;
    state.tab='installation';changed();
  }
  async function seedProfile(){
    requireEdit();const work=state.profileWork;
    if(!work?.workshareCaseId||!work.profileId)throw new Error('Select the original attached Workshare and installed receiving profile.');
    if(work.dirty&&!confirm('Keep the complete source history and replace the current edited profile bindings?'))return;
    await bridge.refreshCase();await readCatalogue();
    const selected=catalogue.profiles.find(x=>x.id===work.profileId);if(!selected)throw new Error('Select an installed complete profile.');
    const selection={...clone(work.selection),expectedVersion:current().version};
    const value=await bridge.api('/api/operations/'+caseId+'/installation-workshare-seed',{
      ...selection,workshareCaseId:work.workshareCaseId,installationId:null,expectedRevision:0});
    if(value.source?.caseId!==caseId||value.source.version!==selection.expectedVersion||value.installationId!==null||
       value.expectedRevision!==0||value.workshare?.caseId!==work.workshareCaseId)
      throw new Error('The native installation seed differs from the selected original Workshare.');
    work.selection=selection;work.seed=value;work.profile=clone(selected.profile);work.profileSha256=selected.sha256;
    work.bindingsText=pretty(bindingTemplate(value,selected.profile));work.dirty=false;work.prepared=null;work.preview=null;changed();
    state.notice='Prepared the full native profile binding template. Enter only actual known deployment, receiving and payment selections.';
  }
  async function previewProfile(){
    requireEdit();const work=state.profileWork;
    if(!work?.seed)throw new Error('Read the full original Workshare/profile binding template first.');
    const bindings=parseObject(work.bindingsText,'Complete profile bindings'),beforeText=work.bindingsText;
    const value=prepareInstallation(work.seed,work.profile,bindings);
    await bridge.refreshCase();await readCatalogue();
    if(current().version!==work.seed.source.version||catalogue.profiles.find(x=>x.id===work.profileId)?.sha256!==work.profileSha256)
      throw new Error('The case or installed profile changed. Preserve your bindings and reopen the original current source.');
    const review=await bridge.api('/api/operations/'+caseId+'/installation-preview',value.preview);
    if(work!==state.profileWork||work.bindingsText!==beforeText)throw new Error('The full bindings changed during review.');
    if(review.source?.caseId!==caseId||review.source.version!==value.source.version||!equal(review.document,value.document))
      throw new Error('The native complete Installation preview differs from the prepared document.');
    work.prepared=value;work.preview=review;work.previewBindings=beforeText;changed();
    state.notice='Reviewed the complete source, '+value.document.checks.length+' acceptance checks and native installation document.';
  }
  async function receiveProfile(){
    requireEdit();const work=state.profileWork;
    if(!work?.prepared||!work.preview||work.previewBindings!==work.bindingsText)
      throw new Error('Review the exact current complete bindings before opening their Installation draft.');
    await bridge.refreshCase();
    if(current().version!==work.prepared.source.version)throw new Error('The original case changed after review. Keep the bindings and review the complete current selection.');
    const accepted=await bridge.receiveDraft({scope:{caseId,version:current().version},document:clone(work.preview.document),
      prepared:clone(work.prepared),preview:clone(work.preview),sourcePreparationId:work.attachmentId,
      sourceDeskDraftId:state.draftId,workshareCaseId:work.workshareCaseId});
    if(!accepted?.applied)throw new Error(accepted?.message||'The original Installation editor could not receive this complete draft.');
    work.receivedDraftKey=accepted.draftKey;work.dirty=false;state.notice='Opened the complete prepared Installation draft. Review and save its original native edition in the Installation editor.';
    changed();await persistNow();state.open=false;root.hidden=true;bridge.close?.();
  }
  function snapshotDownload(){
    const value={schema:SCHEMA,scope,sourceDraftId:state.draftId,selectedRevision:state.revision??saved?.revision??null,
      saved:clone(selectedDraft()),working:clone(state.work),caseForm:clone(state.caseForm),
      profileWork:clone(state.profileWork),pendingRequest:request?clone(request):null};
    downloadBlob(pretty(value),(state.draftId||'installation-source-working')+'-working.json');
    state.notice='Downloaded the complete selected draft, unsaved mappings, profile bindings and original pending request.';
  }

  function header(title,description,actions=''){
    return '<div class="source-desk-heading"><div><h3>'+esc(title)+'</h3><p>'+esc(description)+'</p></div><div class="source-desk-actions">'+actions+'</div></div>';
  }
  function filesView(){
    const selected=files();
    return header('Complete original files','Keep the original bytes, receiving filename, source reference and observation time together.')+
      '<div class="source-desk-upload"><label>Choose complete original file<input type="file" data-source-upload data-source-edit></label>'+
      (chosenFile?hint('Selected '+chosenFile.name+' · '+chosenFile.size+' bytes. The complete input is retained before its first request.'):'')+
      '<div class="source-desk-fields">'+field('Receiving filename','upload.filename',state.upload.filename)+
      field('Media type','upload.mediaType',state.upload.mediaType)+field('Original source URL / reference','upload.sourceUrl',state.upload.sourceUrl,{wide:true})+
      field('Observed at, with timezone','upload.observedAt',state.upload.observedAt,{help:'ISO 8601, for example 2026-10-13T00:00:00Z.'})+'</div>'+
      '<div class="source-desk-actions">'+btn('Retain complete file','upload','',!saved||!chosenFile||historic())+'</div></div>'+
      (selected.length?table(['Original receiving file','Complete identity and provenance','Actions'],selected.map(f=>[
        '<strong>'+esc(f.filename)+'</strong><br>'+esc(f.mediaType)+' · '+f.bytes+' bytes',
        '<code>'+esc(f.sha256)+'</code><br>'+esc(f.sourceUrl)+'<br>'+esc(f.observedAt),
        btn('Inspect JSON','inspect','data-id="'+f.id+'"')+btn('Download original','file-download','data-id="'+f.id+'"')+
        btn('Remove from next edition','remove','data-id="'+f.id+'"',historic()||pending())
      ])):empty('Retain the whole Workshare packet and each document that supplies original effort or commissioning context.'))+
      inspectionView();
  }
  function inspectionView(){
    if(!inspection)return '';
    const choosing=state.pointerTarget&&state.caseForm;
    const candidates=inspection.numericCandidates.map((x,i)=>({x,i})).filter(({x})=>!choosing||x.basis===state.pointerTarget.basis);
    return '<section class="source-desk-inspection">'+header('Original file inspection',inspection.file.filename+' · '+inspection.file.bytes+' bytes',btn('Close inspection','inspect-close'))+
      (inspection.packet?'<p><strong>'+esc(inspection.packet.plan.title||inspection.packet.caseId)+'</strong><br>'+esc(inspection.packet.plan.customer||'')+
        ' · '+esc(inspection.packet.plan.supplier||'')+'</p><p>Original case <code>'+esc(inspection.packet.caseId)+'</code><br>Selected plan <code>'+esc(inspection.packet.planSha256)+'</code></p>':'')+
      (candidates.length?'<details'+(choosing?' open':'')+'><summary>Exact original numeric values ('+inspection.numericCandidateCount+' in complete source)</summary>'+
        (inspection.candidatesLimited?hint('This preview lists the first 2,000 values. Every original byte remains below; enter any exact JSON pointer manually.'):'')+
        table(['Source','Original JSON pointer','Exact original value',...(choosing?['Selection']:[])],candidates.map(({x,i})=>[
          esc(x.basis),'<code>'+esc(x.pointer)+'</code>','<code>'+esc(x.text)+'</code>',...(choosing?[btn('Use this pointer','pointer','data-index="'+i+'"')]:[])
        ]))+'</details>':'')+
      (inspection.phaseAmendmentReceipt?'<details><summary>Complete selected phase-ID amendment receipt</summary><pre>'+esc(pretty(inspection.phaseAmendmentReceipt))+'</pre></details>':'')+
      '<details><summary>Complete original JSON, unchanged</summary><pre>'+esc(inspection.jsonText)+'</pre></details></section>';
  }
  function effortFields(row,path,total=false){
    const sourceChoices=[['','Original selected plan'],...files().map(f=>[f.filename,f.filename])];
    return '<div class="source-desk-effort">'+
      field('Assigned hours',path+'.hours',row.hours,{help:'Exact decimal text; native preparation verifies the original source value.'})+
      field('Value belongs to',path+'.sourceFile',row.sourceFile,{options:sourceChoices})+
      field('Exact JSON pointer',path+'.sourcePointer',row.sourcePointer)+
      field('Original value unit',path+'.unit',row.unit,{options:[['hours','Hours'],['minutes','Minutes']]})+
      (!total?field('Original effort basis',path+'.basis',row.basis,{area:true,wide:true}):'')+
      '<div class="source-desk-actions">'+btn('Inspect original values','pointer-inspect','data-index="'+(total?'total':path.split('.').at(-1))+'"')+'</div></div>';
  }
  function caseFormView(){
    const form=state.caseForm;if(!form)return '';
    const profileOptions=[['','Select installed profile'],...(catalogue?.profiles||[]).map(x=>[x.id,x.profile.title||x.profile.name||x.id])];
    return '<section class="source-desk-customer">'+header(form.index===null?'Add complete customer mapping':'Edit complete customer mapping',
      'Map every original phase and total to explicit source values. The original documents and commercial semantics stay retained.',
      btn('Close mapping','case-cancel'))+
      '<div class="source-desk-fields">'+
      field('Original customer case ID','caseForm.caseId',form.caseId,{wide:true})+
      field('Installed receiving profile','caseForm.profile',form.profile,{options:profileOptions})+
      field('Whole original Workshare packet','caseForm.packetId',form.packetId,{options:[['','Select original packet'],...files().map(f=>[f.id,f.filename])]})+
      '</div><details><summary>Explicit original phase-ID amendment, if required</summary>'+
      hint('Only an explicitly reviewed phase-ID/dependency mapping is supported. Keep reason, source URL and selected receiving filename; native inspection verifies the complete inverse against the original packet.')+
      field('Complete phaseIdAmendment JSON','caseForm.amendmentText',form.amendmentText,{area:true,rows:8,wide:true})+'</details>'+
      '<div class="source-desk-actions">'+btn('Review complete packet and phases','packet-review')+'</div>'+
      (form.packet?'<p><strong>'+esc(form.packet.plan.title)+'</strong><br>'+esc(form.packet.plan.customer)+' / '+esc(form.packet.plan.supplier)+
       '</p><p>Native selected plan SHA-256 <code>'+esc(form.packet.planSha256)+'</code></p>'+
       '<details><summary>Complete original commercial terms</summary><pre>'+esc(pretty(form.packet.plan.commercial))+'</pre></details>'+
       '<fieldset><legend>Whole supporting documents</legend>'+files().filter(f=>f.id!==form.packetId).map(f=>
         '<label class="source-desk-check"><input type="checkbox" data-source-case-file="'+f.id+'" data-source-edit'+
         (form.fileIds.includes(f.id)?' checked':'')+'> <span>'+esc(f.filename)+' · '+f.bytes+' bytes</span></label>').join('')+'</fieldset>'+
       '<h4>Every original phase</h4>'+form.phaseRows.map((row,index)=>{
         const phase=form.packet.plan.phases.find(x=>x.id===row.phaseId);
         return '<fieldset><legend>'+esc(row.phaseId)+' · '+esc(phase?.title)+'</legend>'+
           '<p>'+esc(phase?.description)+'</p>'+hint('Owner: '+(phase?.owner??'')+' · Dependencies: '+(phase?.depends_on||[]).join(', '))+
           '<p><strong>Acceptance:</strong> '+esc(phase?.acceptance)+'</p>'+
           effortFields(row,'caseForm.phaseRows.'+index)+'</fieldset>';
       }).join('')+'<fieldset><legend>Original complete effort total</legend>'+effortFields(form.total,'caseForm.total',true)+'</fieldset>'+
       (form.earlierPhaseRows?.length?'<details open><summary>Retained earlier mapping fields for changed phase IDs</summary><pre>'+esc(pretty(form.earlierPhaseRows))+'</pre></details>':'')+
       '<details><summary>Optional complete native profile bindings</summary>'+
       field('Original bindings JSON','caseForm.bindingsText',form.bindingsText,{area:true,rows:10,wide:true})+'</details>'+
       '<div class="source-desk-actions">'+btn('Apply complete mapping to selection','case-add')+'</div>':
       empty('Review the original packet to expose its full phases and commercial scope.'))+'</section>';
  }
  function mappingView(){
    let selected,error;try{selected=selectionValue();}catch(e){error=e.message;}
    return header('Source and effort mapping','Prepare one complete receiving cohort from exact original customer documents.',
      btn('Add original customer','case-new','',!saved||historic()))+
      (selected?'<div class="source-desk-fields">'+
        field('Preparation operation ID','selection.operationId',selected.operationId)+
        field('Original request prefix','selection.requestPrefix',selected.requestPrefix)+
        field('Complete receiving operation name','selection.receivingName',selected.receivingName,{wide:true})+
        field('Selection source URL / reference','selection.sourceUrl',selected.sourceUrl,{wide:true})+
        field('Selection observed at, with timezone','selection.observedAt',selected.observedAt)+'</div>'+
        (selected.cases.length?table(['Original customer / installed profile','Complete selected plan','Effort and source files','Actions'],selected.cases.map((c,i)=>[
          '<strong>'+esc(c.caseId)+'</strong><br>'+esc(c.profile),
          '<code>'+esc(c.planSha256)+'</code>',esc(c.effortTotal?.hours??'')+' hours · '+(c.productionEffort?.length??0)+' phases<br>'+
            esc(c.packet?.filename)+' + '+(c.files?.length??0)+' complete documents',
          btn('Edit mapping','case-edit','data-index="'+i+'"',historic())+btn('Remove from selection','case-remove','data-index="'+i+'"',historic())
        ])):empty('Add each original customer with the complete quoted plan, explicit effort pointers and full source documents.')):hint(error))+
      caseFormView()+inspectionView()+
      '<details'+(error?' open':'')+'><summary>Complete editable native source selection</summary>'+
      field('Full native selection JSON','work.selectionText',state.work?.selectionText||'',{area:true,rows:18,wide:true})+
      hint('This is the exact complete JSON saved to the native draft. All original values, pointers, files and optional bindings remain editable.')+'</details>'+
      '<div class="source-desk-actions">'+btn('Save complete selection','save-selection','',!saved||historic()||!state.work?.dirty)+
      btn('Prepare complete native package','prepare','',!saved?.selection||!!state.work?.dirty||!!state.caseForm?.dirty||historic())+'</div>';
  }
  function outputsView(){
    const list=selectedDraft()?.preparations||[];
    return header('Complete prepared outputs','Original native preparation retains every declared document, exact Workshare scope and receiving input.')+
      (list.length?'<div class="source-desk-actions">'+list.map(x=>btn('Preparation from draft '+x.draftRevision,'preparation-open','data-id="'+x.id+'"')).join('')+'</div>':empty('Save a complete source mapping, then prepare its native receiving package.'))+
      (prepared?'<p><strong>'+esc(prepared.state)+'</strong> · prepared '+esc(prepared.preparedAt)+' by '+esc(prepared.actor)+'</p>'+
       '<p>Selection <code>'+esc(prepared.selectionSha256)+'</code></p>'+
       table(['Complete original customer','Original plan / effort','Installed profile'],(prepared.report.cases||[]).map(c=>[
         esc(c.caseId),'<code>'+esc(c.planSha256)+'</code><br>'+esc(c.completeEffort?.hours??'')+' hours',esc(c.profile??'')
       ]))+
       table(['Complete file','Byte identity','Download'],prepared.files.map(f=>[
         '<strong>'+esc(f.filename)+'</strong><br>'+esc(f.mediaType),f.bytes+' bytes<br><code>'+esc(f.sha256)+'</code>',
         btn('Download complete file','output-download','data-filename="'+esc(f.filename)+'"')
       ]))+
       '<div class="source-desk-actions">'+btn('Download whole source and receiving ZIP','archive-download')+
       btn('Attach complete cohort to this case','attach','',historic()||readonly()||pending())+
       (latestAttachment()?btn('Open native Installation preparation','installation-open'):'')+'</div>'+
       hint('Attachment is one native case transaction. If the complete cohort exceeds the original case capacity, no partial source set is recorded.')+
       '<details><summary>Complete native preparation report</summary><pre>'+esc(pretty(prepared.report))+'</pre></details>'+
       '<details><summary>Original engine and selected profile sources</summary><pre>'+esc(pretty({engine:prepared.engine,profiles:prepared.report.profiles}))+'</pre></details>':'');
  }
  function bindingFields(work){
    let b;try{b=parseObject(work.bindingsText,'Complete profile bindings');}catch(error){return hint(error.message);}
    const f=(label,path,value,options={})=>field(label,path,value,options).replace('data-source-field=','data-source-binding=');
    const currentCase=bridge.caseData?.(),deployments=currentCase?.records?.deployments||[];
    const merchants=deployments.filter(x=>['MERCHANT','BOTH'].includes(x.role)),buyers=deployments.filter(x=>['BUYER','BOTH'].includes(x.role));
    return '<div class="source-desk-fields">'+
      f('Accountable existing merchant deployment','merchantDeploymentId',b.merchantDeploymentId??'',{options:[['','Not selected'],...merchants.map(x=>[x.id,x.name+' · '+x.operator])],help:'Record a new deployment through the existing case editor if it is not listed.'})+
      f('Actual receiving host','receiving.host',b.receiving?.host??'')+
      f('Named receiving operator','receiving.operator',b.receiving?.operator??'')+
      f('Exact customer source / edition','source.reference',b.source?.reference??'',{wide:true})+
      f('Original source-use authority','source.authority',b.source?.authority??'',{area:true,wide:true})+
      f('Selected network','payment.network',b.payment?.network??'')+
      f('Selected asset','payment.asset',b.payment?.asset??'')+
      f('Approved recipient','payment.recipient',b.payment?.recipient??'')+
      f('Payment authority','payment.authority',b.payment?.authority??'',{wide:true})+
      f('Exact price in atomic units','payment.priceAtomic',b.payment?.priceAtomic??'')+
      f('Selected whole task count','payment.taskUnits',b.payment?.taskUnits??'')+
      f('Exact task budget in atomic units','payment.taskBudgetAtomic',b.payment?.taskBudgetAtomic??'')+'</div>'+
      '<fieldset><legend>Existing independent customer deployments</legend>'+
      (buyers.length?buyers.map(x=>'<label class="source-desk-check"><input type="checkbox" data-source-buyer="'+esc(x.id)+'" data-source-edit'+
        (b.buyerDeploymentIds?.includes(x.id)?' checked':'')+'> <span>'+esc(x.name)+' · '+esc(x.operator)+'</span></label>').join(''):hint('Use the original case deployment editor to record an actual customer operator. No deployment is guessed here.'))+'</fieldset>';
  }
  function installationView(){
    const attachment=latestAttachment(),work=state.profileWork;
    if(!attachment)return header('Prepare the native Installation','Attach a complete original preparation first.')+empty('Your source packet is preserved in Outputs. Attachment records every source before native Workshare receiving.');
    return header('Receive into the original Installation editor','Start from complete original Workshare scope, then add actual customer deployment and operating selections.',
      btn('Refresh attached Workshare selection','installation-open','',!!work?.dirty))+
      '<p>Complete preparation <code>'+esc(attachment.preparationId)+'</code> · '+attachment.sources.length+' retained case sources.</p>'+
      (work?'<div class="source-desk-fields">'+
        field('Original attached Workshare case','profileWork.workshareCaseId',work.workshareCaseId,{options:[['','Select original case'],...work.inventory.cases.map(x=>[x.caseId,x.title+' · '+x.hours+' hours'])]})+
        field('Installed task / receiving profile','profileWork.profileId',work.profileId,{options:[['','Select installed profile'],...(catalogue?.profiles||[]).map(x=>[x.id,x.profile.title||x.profile.name||x.id])]})+'</div>'+
        '<div class="source-desk-actions">'+btn('Read original profile binding template','profile-seed')+'</div>'+
        (work.seed?'<p><strong>'+esc(work.seed.workshare.commercial?.currency)+' '+esc(work.seed.workshare.commercial?.amount)+'</strong> · '+
          esc(work.seed.workshare.commercial?.price_status)+' · '+esc(work.seed.workshare.hours)+' original planned hours</p>'+
          bindingFields(work)+
          '<details><summary>Complete editable profile bindings</summary>'+
          field('Full native binding JSON','profileWork.bindingsText',work.bindingsText,{area:true,rows:18,wide:true})+'</details>'+
          '<details><summary>Complete installed profile, implementation steps and source files</summary><pre>'+esc(pretty(work.profile))+'</pre></details>'+
          '<div class="source-desk-actions">'+btn('Review complete native Installation','profile-preview')+
          btn('Open complete Installation draft','profile-apply','',!work.preview||work.previewBindings!==work.bindingsText)+
          btn('Download full prepared workorder','profile-download','',!work.prepared||work.previewBindings!==work.bindingsText)+'</div>'+
          (work.prepared?'<section class="source-desk-review"><h4>Actual selections still required</h4>'+
            (work.prepared.selections.length?table(['Field','Operating purpose'],work.prepared.selections.map(x=>[esc(x.field),esc(x.purpose)])):
              hint('The profile’s required operating selections are present. Original native acceptance checks remain under their own receiving workflow.'))+
            '<details><summary>Complete original native Installation preview</summary><pre>'+esc(pretty(work.preview))+'</pre></details></section>':''):''):
        '<div class="source-desk-actions">'+btn('Read attached Workshare inventory','installation-open')+'</div>');
  }
  function historyView(){
    const value=selectedDraft();
    return header('Original saved source history','Every save appends a complete draft revision. Earlier files and prepared packages retain their own identities.')+
      (saved?'<div class="source-desk-actions"><label>Saved revision<input type="number" data-source-revision min="1" max="'+saved.revision+'" value="'+(state.revision??saved.revision)+'"></label>'+
        btn('Open exact revision','revision-open')+btn('Open current head','current-open')+'</div>'+
        table(['Revision / original request','Recording context','Change'],[...(value?.history||[])].reverse().map(row=>[
          esc(row.revision??'')+'<br><code>'+esc(row.requestId??'')+'</code>',
          esc(row.actor??'')+'<br>'+esc(row.at??row.recordedAt??'')+'<br>'+esc(row.note??''),
          '<details><summary>'+esc(row.action??'Complete source change')+'</summary><pre>'+esc(pretty(row))+'</pre></details>'
        ]))+
        '<details><summary>Complete original attachment receipts</summary><pre>'+esc(pretty(value?.attachments||[]))+'</pre></details>':
        empty('Create or open an original source preparation to see its complete history.'));
  }
  function conflictView(){
    if(!saved||!workingDirty()||state.work?.baseRevision===saved.revision)return '';
    return '<section class="source-desk-recovery">'+header('Saved source draft advanced',
      'Your complete edited mapping is preserved from revision '+state.work.baseRevision+'. The current saved revision is '+saved.revision+'.')+
      '<details><summary>Current saved complete selection</summary><pre>'+esc(pretty(saved.selection))+'</pre></details>'+
      '<details><summary>Your complete retained edited selection</summary><pre>'+esc(state.work.selectionText)+'</pre></details>'+
      (state.caseForm?.dirty?'<details><summary>Your complete edited customer mapping</summary><pre>'+esc(pretty(state.caseForm))+'</pre></details>':'')+
      (state.profileWork?.dirty?'<details><summary>Your complete edited Installation bindings</summary><pre>'+esc(pretty(state.profileWork))+'</pre></details>':'')+
      '<div class="source-desk-actions">'+btn('Keep edited mapping against this reviewed revision','rebase')+btn('Open current saved selection','current-open')+'</div></section>';
  }
  async function rebaseWorking(){
    checkContext();if(readonly()||pending()||historic())throw new Error('Recover the original editable current source draft first.');
    const before=saved,head=await bridge.api(prefix+'/'+state.draftId);
    if(head.revision!==before.revision){saved=head;edition=head;changed();throw new Error('The source draft advanced again. Review its newly returned complete selection.');}
    if(!confirm('Keep your complete edited mapping against saved revision '+head.revision+' after reviewing both selections?'))return;
    state.reconciliations??=[];
    state.reconciliations.push({fromRevision:state.work.baseRevision,reviewedRevision:head.revision,
      editedSelectionText:state.work.selectionText,editedCustomerMapping:clone(state.caseForm),
      editedProfileBindings:clone(state.profileWork),savedSelection:clone(head.selection),at:new Date().toISOString()});
    state.work.baseRevision=head.revision;changed();await persistNow();
    state.notice='Kept both complete selections and your edited mapping. Native preparation will verify every source binding before attachment.';
  }
  function recoveryView(){
    if(!request)return '';
    return '<section class="source-desk-recovery">'+header('Original request retained',
      'Keep this same complete request through an interrupted response or a saved-result readback.')+
      '<p><code>'+esc(request.body.requestId)+'</code> · '+esc(request.body.action)+' · '+esc(request.state)+'</p>'+
      (request.lastError?hint(request.lastError.message):'')+
      '<div class="source-desk-actions">'+btn('Read original request status','request-status')+
      btn(request.receipt?'Adopt recorded original receipt':'Retry exact original request','request-retry')+
      btn('Keep rejected request and reconcile fields','request-reject','',!request.lastError?.definitive)+'</div>'+
      '<details><summary>Exact complete original request and retained receipt</summary><pre>'+esc(pretty(request))+'</pre></details></section>';
  }
  function render(){
    if(!available())return;
    root.hidden=!state.open;
    const tabs=[['files','1 · Original files'],['mapping','2 · Source mapping'],['outputs','3 · Complete package'],['installation','4 · Installation'],['history','Saved history']];
    const content=state.tab==='mapping'?mappingView():state.tab==='outputs'?outputsView():state.tab==='installation'?installationView():
      state.tab==='history'?historyView():filesView();
    root.innerHTML=header('Prepare original source workshares','Complete documents → exact effort mapping → native receiving package → original Installation.',
      btn('Download complete working fields','working-download','',!saved)+btn('Close source desk','close'))+
      '<p data-source-status class="source-desk-status" aria-live="polite"></p>'+
      '<div class="source-desk-layout"><aside><h4>Retained preparations</h4>'+
      '<label>Name a new preparation<input data-source-new-title maxlength="300" placeholder="Customer supplier onboarding" value="'+esc(state.newTitle)+'"'+(pending()?' disabled':'')+'></label>'+
      btn('Create source preparation','new','',!initialized||readonly()||pending())+
      '<div class="source-desk-drafts">'+heads.map(x=>'<button type="button" data-source-action="draft-open" data-id="'+x.id+'"'+
        (state.draftId===x.id?' aria-current="page"':'')+'><strong>'+esc(x.title)+'</strong><span>Revision '+x.revision+' · '+x.fileCount+' files</span>'+
        '<small>'+x.preparationCount+' complete preparations · '+x.attachmentCount+' attachments</small></button>').join('')+'</div>'+
      (heads.length?'':empty('No retained source preparation in this case yet.'))+'</aside><div class="source-desk-main">'+
      (saved?'<div class="source-desk-edition"><strong>'+esc(saved.title)+'</strong><span>'+
        (historic()?'Historical revision '+state.revision:'Current saved revision '+saved.revision)+
        (workingDirty()?' · edited fields retained in this browser':'')+'</span></div>':'')+
      (historic()?hint('This is an immutable earlier source edition. Open the current head to edit. Complete earlier files and packages remain available.'):'')+
      recoveryView()+conflictView()+'<nav aria-label="Source preparation steps">'+tabs.map(([id,label])=>'<button type="button" data-source-action="tab" data-tab="'+id+'"'+
        (state.tab===id?' aria-current="page"':'')+'>'+esc(label)+'</button>').join('')+'</nav>'+
      (saved?content:empty(initialized?'Create or open an original source preparation to begin.':'Opening the retained browser journal and original operating case…'))+
      (saved?'<label class="source-desk-note">Reason for the next source change<textarea data-source-field="note" data-source-edit rows="3">'+esc(state.note)+'</textarea></label>':'')+
      '</div></div>';
    status();controls();
  }

  function editBinding(path,value){
    requireEdit();const work=state.profileWork;if(!work?.seed)throw new Error('Read the native profile template first.');
    const bindings=parseObject(work.bindingsText,'Complete profile bindings');
    if(path==='payment.taskUnits'){
      if(value!==''&&!/^(0|[1-9][0-9]*)$/.test(value))throw new Error('Keep the task count as an exact whole number.');
      value=value===''?null:Number(value);
      if(value!==null&&!Number.isSafeInteger(value))throw new Error('The whole task count exceeds its native range.');
    }else if(['merchantDeploymentId','payment.priceAtomic','payment.taskBudgetAtomic'].includes(path))value=value===''?null:value;
    setPath(bindings,path,value);work.bindingsText=pretty(bindings);work.dirty=true;work.prepared=null;work.preview=null;changed();
  }
  function handleField(target){
    const path=target.dataset.sourceField;if(!path)return;
    if(!editing())return;
    let value=target.value;
    if(path.startsWith('selection.')){
      const selected=selectionValue();setPath(selected,path.slice(10),value);keepSelection(selected);return;
    }
    if(path.startsWith('profileWork.')&&['workshareCaseId','profileId'].includes(path.split('.')[1])){
      const work=state.profileWork,key=path.split('.')[1],old=work[key];
      if(value!==old&&work.dirty&&!confirm('Replace the edited binding fields with the newly selected original Workshare/profile?')){
        target.value=old;return;
      }
      if(value!==old){work[key]=value;work.seed=null;work.bindingsText='';work.prepared=null;work.preview=null;work.dirty=false;changed();render();}
      return;
    }
    setPath(state,path,value);
    if(path==='work.selectionText'){state.work.dirty=true;prepared=null;state.preparationId=null;}
    if(path.startsWith('caseForm.')){state.caseForm.dirty=true;if(path==='caseForm.packetId')state.caseForm.packet=null;}
    if(path==='profileWork.bindingsText'){state.profileWork.dirty=true;state.profileWork.prepared=null;state.profileWork.preview=null;}
    changed();status();
  }
  root.addEventListener('input',event=>{
    const target=event.target;
    try{
      if(target.matches('[data-source-new-title]')){state.newTitle=target.value;changed();return;}
      if(target.matches('[data-source-binding]')){editBinding(target.dataset.sourceBinding,target.value);return;}
      if(target.matches('[data-source-field]')&&target.tagName!=='SELECT')handleField(target);
    }catch(error){state.error=error.message||String(error);status();}
  });
  root.addEventListener('change',event=>{
    const target=event.target;
    try{
      if(target.matches('[data-source-upload]')){
        if(!editing())return;
        chosenFile=target.files?.[0]??null;
        if(chosenFile){state.upload.filename=chosenFile.name;state.upload.mediaType=chosenFile.type||'application/octet-stream';state.upload.observedAt=new Date().toISOString();}
        changed();render();return;
      }
      if(target.matches('select[data-source-binding]')){editBinding(target.dataset.sourceBinding,target.value);return;}
      if(target.matches('[data-source-buyer]')){
        requireEdit();const work=state.profileWork,bindings=parseObject(work.bindingsText,'Complete profile bindings'),id=target.dataset.sourceBuyer;
        const selected=new Set(bindings.buyerDeploymentIds||[]);
        if(target.checked)selected.add(id);else selected.delete(id);
        bindings.buyerDeploymentIds=[...selected];work.bindingsText=pretty(bindings);work.dirty=true;work.prepared=null;work.preview=null;changed();return;
      }
      if(target.matches('[data-source-case-file]')){
        requireEdit();const form=state.caseForm;if(!form)throw new Error('Open the complete customer mapping first.');
        const ids=new Set(form.fileIds);if(target.checked)ids.add(target.dataset.sourceCaseFile);else ids.delete(target.dataset.sourceCaseFile);
        form.fileIds=[...ids];form.dirty=true;changed();return;
      }
      if(target.matches('select[data-source-field]'))handleField(target);
    }catch(error){state.error=error.message||String(error);status();}
  });
  root.addEventListener('click',event=>{
    const target=event.target.closest('[data-source-action]');if(!target||!root.contains(target)||target.disabled)return;
    event.preventDefault();const action=target.dataset.sourceAction;
    if(action==='close'){own(closeView()).catch(error=>{state.error=error.message;status();});return;}
    run(async()=>{
      if(action==='new')return createDraft();
      if(action==='draft-open')return openDraft(target.dataset.id);
      if(action==='current-open')return openDraft(state.draftId);
      if(action==='revision-open'){
        const n=Number($('[data-source-revision]')?.value);
        if(!Number.isSafeInteger(n)||n<1||n>saved.revision)throw new Error('Select an actual retained draft revision.');
        return openDraft(state.draftId,n);
      }
      if(action==='tab'){
        state.tab=target.dataset.tab;changed();
        if(state.tab==='installation'&&!state.profileWork&&latestAttachment()&&!historic())await openInstallation();
        return;
      }
      if(action==='working-download')return snapshotDownload();
      if(action==='rebase')return rebaseWorking();
      if(action==='upload')return upload();
      if(action==='inspect')return openInspection(target.dataset.id);
      if(action==='inspect-close'){inspection=null;state.inspectionFileId=null;state.pointerTarget=null;changed();return;}
      if(action==='remove'){
        requireEdit();const f=files().find(x=>x.id===target.dataset.id);
        if(f&&confirm('Remove '+f.filename+' from the next source revision? The full original remains in earlier history.'))return issue('file.remove',{fileId:f.id});
        return;
      }
      if(action==='file-download'){
        const f=files().find(x=>x.id===target.dataset.id);if(!f)throw new Error('Select an original complete file.');
        return download(prefix+'/'+state.draftId+'/files/'+f.id+'?'+revisionQuery()+'expectedSha256='+f.sha256,f);
      }
      if(action==='case-new')return editCase();
      if(action==='case-edit')return editCase(Number(target.dataset.index));
      if(action==='case-remove')return removeCase(Number(target.dataset.index));
      if(action==='case-cancel'){
        if(replaceFormAllowed(state.caseForm)){state.caseForm=null;state.pointerTarget=null;changed();}return;
      }
      if(action==='packet-review')return reviewPacket();
      if(action==='pointer-inspect')return inspectPointerSource(target.dataset.index);
      if(action==='pointer')return choosePointer(Number(target.dataset.index));
      if(action==='case-add')return applyCase();
      if(action==='save-selection')return saveSelection();
      if(action==='prepare')return prepare();
      if(action==='preparation-open'){await readPreparation(target.dataset.id);state.tab='outputs';changed();return;}
      if(action==='output-download'){
        const file=prepared?.files.find(x=>x.filename===target.dataset.filename);if(!file)throw new Error('Select one full prepared output.');
        return download(prefix+'/'+state.draftId+'/preparations/'+prepared.id+'/outputs/'+encodeURIComponent(file.filename)+'?expectedSha256='+file.sha256,file);
      }
      if(action==='archive-download'){
        const path=prefix+'/'+state.draftId+'/preparations/'+prepared.id+'/archive',id=prepared.id;
        const receipt=await bridge.api(path+'?describe=1');
        if(receipt.preparationId!==id)throw new Error('The whole archive changed original preparation.');
        return download(path+'?expectedSha256='+receipt.sha256,receipt);
      }
      if(action==='attach')return attach();
      if(action==='installation-open')return openInstallation();
      if(action==='profile-seed')return seedProfile();
      if(action==='profile-preview')return previewProfile();
      if(action==='profile-apply')return receiveProfile();
      if(action==='profile-download'){
        const w=state.profileWork;if(!w?.prepared||w.previewBindings!==w.bindingsText)throw new Error('Review the complete current profile bindings.');
        downloadBlob(pretty(w.prepared),'INSTALLATION_PREPARATION.json');
        downloadBlob(renderWorkorder(w.prepared),'INSTALLATION_WORKORDER.md','text/markdown;charset=utf-8');return;
      }
      if(action==='request-status')return readOriginal();
      if(action==='request-retry')return sendOriginal();
      if(action==='request-reject')return retireRejected();
    });
  });
  const beforeUnload=event=>{
    if(workingDirty()||pending()||storageError||persistedGeneration<generation){
      event.preventDefault();event.returnValue='';
    }
  };
  window.addEventListener('beforeunload',beforeUnload);
  async function closeView(){
    if(busy||hostBusy)return;
    await persistNow();state.open=false;changed();await persistNow();root.hidden=true;bridge.close?.();
  }
  async function initialize(){
    let retained=await journal.get('working');
    if(retained){
      if(retained.schema!==SCHEMA||!equal(retained.scope,scope))throw new Error('The retained browser draft belongs to another original case or plan.');
      state={...clone(initial),...clone(retained)};state.error='';
      if(state.pendingId){
        request=await journal.get('request:'+state.pendingId);
        if(!request||request.schema!==SCHEMA||request.caseId!==caseId||request.draftId!==state.draftId||
           request.body?.requestId!==state.pendingId||hash(stable({schema:SCHEMA,caseId,draftId:request.draftId,body:request.body}))!==request.requestSha256)
          throw new Error('The complete original pending request is unavailable. Keep this browser journal for recovery.');
      }
    }
    await refreshHeads();await readCatalogue();
    if(state.draftId){
      try{
        const head=await bridge.api(prefix+'/'+state.draftId);
        acceptState(head,{replace:false});
        if(retained?.revision!==null&&retained?.revision!==undefined&&retained.revision!==head.revision){
          state.revision=retained.revision;edition=await bridge.api(prefix+'/'+state.draftId+'?revision='+state.revision);
          state.work=clone(retained.work)||{draftId:state.draftId,baseRevision:edition.revision,selectionText:edition.selection?pretty(edition.selection):'',dirty:false};
        }
        if(state.preparationId)await readPreparation(state.preparationId);
      }catch(error){
        if(!(error.status===404&&request?.body.action==='create'))throw error;
        saved=null;edition=null;
      }
    }
    initialized=true;
    if(request?.receipt)await adoptReceipt(request.receipt,request);
    if(state.inspectionFileId&&saved){
      try{inspection=await inspectFile(state.inspectionFileId);}catch(error){state.notice='Retained your working fields; reopen their original source inspection. '+error.message;}
    }
    await persistNow();render();
  }
  render();
  const ready=own(initialize()).catch(error=>{
    initialized=false;state.error=error.message||String(error);if(available())render();throw error;
  });
  // Expose the original failure while avoiding an unobserved rejected startup.
  ready.catch(()=>{});
  return {
    ready,
    async open(){await ready;state.open=true;changed();await persistNow();render();root.scrollIntoView({block:'start'});},
    setHostBusy(value){hostBusy=!!value;controls();},
    refresh(){if(available())render();},
    dispose(){
      if(closing)return closing;
      alive=false;clearTimeout(timer);timer=null;
      window.removeEventListener('beforeunload',beforeUnload);
      for(const controller of downloads)controller.abort();
      closing=(async()=>{
        // Accepted requests own their full journal through their final receipt.
        while(owned.size)await Promise.allSettled([...owned]);
        if(!disposePersistenceAttempted){
          try{await persistNow();}catch(error){disposePersistenceError=error;}
          finally{disposePersistenceAttempted=true;}
        }
        let closeError=null;
        try{await journal.close();}catch(error){closeError=error;}
        const errors=[disposePersistenceError,closeError].filter(Boolean);
        if(errors.length)throw errors.length===1?errors[0]:new AggregateError(errors,'The preparation desk could not save and close its original browser journal.');
      })().catch(error=>{closing=null;throw error;});
      closing.catch(()=>{});return closing;
    }
  };
}
