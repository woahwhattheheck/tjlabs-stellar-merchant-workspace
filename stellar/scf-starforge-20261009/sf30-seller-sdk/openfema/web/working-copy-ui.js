// MIT. Named preparation in the original OpenFEMA operator.
import {WorkingCopies,FILE_LIMIT} from './working-copies.js';
const clone=value=>structuredClone(value);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const textValue=(node)=>node.type==='checkbox'||node.type==='radio'?{checked:node.checked}:node.multiple?{values:[...node.selectedOptions].map(o=>o.value)}:{value:node.value};
export function createOperatorCopies({state,render,notify,openIntegrationDocument,openRecord,selectPortfolio}){
  let store=null,draft=null,binding=new WeakMap(),saving=Promise.resolve(),lastError=null,dirty=false,serial=0,rendering=false,actionDepth=0,selectionMismatch=false;
  const disabledStates=new Map(),fileReads=new Map(),pendingFiles=new Set(),fileFailures=new Map(),inputReads=new WeakMap();
  function freeze(){for(const node of document.querySelectorAll('#main input,#main select,#main textarea,#main button,#record-body input,#record-body select,#record-body textarea,#record-body button,#selection select,#refresh,#close-record')){if(!disabledStates.has(node))disabledStates.set(node,node.disabled);node.disabled=true;}}
  function thaw(){for(const [node,disabled] of disabledStates)if(node.isConnected)node.disabled=disabled;disabledStates.clear();}
  const $=selector=>document.querySelector(selector);
  const sourceContext=()=>{const {S,I}=state();return {portfolioId:S.view.selectedPortfolioId??null,versionId:S.view.selectedVersionId??null,revision:S.view.revision,record:S.detail?{table:S.detail.table,id:S.detail.record.id||S.detail.record.subject||S.detail.record.key||S.detail.record.disasterNumber}:null,document:I.document?{kind:I.document.kind,id:I.document.record.id}:null};};
  function formKey(form){
    const {S,I}=state(),id=form.id;
    if(['capture-form','import-form','buyer-form','integration-mapping-form','integration-review-form','integration-reconcile-form','integration-compare-form'].includes(id))return id;
    if(id==='review-form')return JSON.stringify([id,S.detail?.portfolioId,S.detail?.versionId,S.detail?.record.subject]);
    if(id==='integration-apply-form')return JSON.stringify([id,I.document?.record.id,S.view.selectedVersionId]);
    return JSON.stringify([id,S.view.selectedPortfolioId,S.view.selectedVersionId,S.table]);
  }
  function fieldKey(node,index){return node.id||node.name+'#'+index;}
  function captureForms(){
    if(!store||!draft||rendering)return;
    for(const form of document.querySelectorAll('#main form,#record-body form')){
      if(form.id==='integration-mapping-form')continue;
      const key=binding.get(form)||formKey(form),fields={};
      [...form.elements].forEach((node,index)=>{if(!['INPUT','SELECT','TEXTAREA'].includes(node.tagName)||['file','password','submit','button'].includes(node.type))return;fields[fieldKey(node,index)]=textValue(node);});
      draft.forms[key]=fields;
    }
    draft.details={...draft.details};
    for(const node of document.querySelectorAll('#main details[id]'))draft.details[node.id]=node.open;
  }
  function capture(){
    if(!store||!draft||rendering)return;
    captureForms();const {S,I}=state();
    draft.ui={section:S.section,table:S.table,search:S.search,sort:S.sort,direction:S.direction,offset:S.offset,context:selectionMismatch?draft.ui.context:sourceContext()};
    draft.integration={draft:I.draft?clone(I.draft):null,mappingId:I.mappingId,deliveryId:I.deliveryId,document:I.document?{kind:I.document.kind,id:I.document.record.id}:null,offset:I.offset,selected:[...I.selected],receivingReviewer:I.receivingReviewer,receivingNote:I.receivingNote};
    dirty=true;serial++;
  }
  function panel(){
    if(!store)return;
    const host=$('#working-copies');if(!host)return;
    const active=store.current,context=draft?.ui.context,current=sourceContext();
    const different=context?.versionId&&context.versionId!==current.versionId;
    const files=Object.entries(draft?.files||{}).map(([slot,file])=>'<li><strong>'+esc(slot.split('|')[0])+'</strong>: '+esc(file.name)+' · '+file.bytes.toLocaleString()+' bytes <button type="button" data-copy-command="file" data-slot="'+esc(slot)+'">Download original</button></li>').join('');
    host.innerHTML='<details id="working-copy-panel"><summary>Working copy: '+esc(active.name)+' <span id="copy-status" role="status">'+esc(lastError?'Save needs attention':dirty?'Saving…':'Saved in this browser')+'</span></summary>'+
      '<div class="copy-grid"><div><label for="working-copy-select">Saved working copies</label><select id="working-copy-select">'+store.root.copies.map(c=>'<option value="'+esc(c.id)+'"'+(c.id===active.id?' selected':'')+'>'+esc(c.name)+'</option>').join('')+'</select></div><div><label for="working-copy-name">Copy name</label><input id="working-copy-name" maxlength="200" value="'+esc(active.name)+'"></div></div>'+
      '<div class="actions">'+[['rename','Rename'],['new','New copy'],['duplicate','Duplicate visible copy'],['save','Save now'],['export','Export complete copy'],['reload','Reload saved copies'],['remove','Remove copy']].map(([id,label])=>'<button type="button" data-copy-command="'+id+'">'+label+'</button>').join('')+'</div>'+
      '<div class="copy-import"><label for="working-copy-file">Reopen complete working-copy JSON</label><input type="file" id="working-copy-file" accept=".json,application/json"><button type="button" data-copy-command="import">Import as separate copy</button></div>'+
      '<p class="small">Private preparation includes full selected files, unfinished fields and original pending requests. Native source editions, saved decisions and published releases stay in the original workspace ZIP. Copies reopen against this same workspace; import sends no native request.</p>'+
      '<p class="small mono">Workspace '+esc(store.root.workspaceId)+' · browser revision '+store.root.revision+' · native revision '+current.revision+'</p>'+
      (different?'<p class="notice">This copy was last used with saved version '+esc(context.versionId)+'. Current native selection is '+esc(current.versionId||'none')+'. <button type="button" data-copy-command="context">Open this copy’s saved selection</button></p>':'')+
      (lastError?'<p class="notice error">'+esc(lastError.message)+' Visible work remains here. Export it before reloading saved copies.</p>':'')+
      (files?'<details><summary>Complete original selected files ('+Object.keys(draft.files).length+')</summary><ul class="copy-files">'+files+'</ul></details>':'')+'</details>';
    for(const node of host.querySelectorAll('button,input,select'))node.disabled=actionDepth>0;
  }
  function status(){
    const node=$('#copy-status');if(node)node.textContent=lastError?'Save needs attention':dirty?'Saving…':'Saved in this browser';
  }
  function save(){
    if(!store)return Promise.resolve();
    const snapshot=clone(draft),selection=store.selection,at=serial;
    const run=saving.catch(()=>{}).then(async()=>{
      await store.save(snapshot,selection);
      if(at===serial){dirty=false;lastError=null;}status();
    }).catch(error=>{lastError=error;dirty=true;status();throw error;});
    saving=run;return run;
  }
  async function settleFiles(){while(pendingFiles.size)await Promise.all([...pendingFiles]);if(fileFailures.size)throw [...fileFailures.values()][0];}
  async function flush(){
    await settleFiles();capture();await save();if(lastError)throw lastError;
  }
  function changed(){
    if(!store||rendering)return;
    capture();void save().catch(error=>notify(error.message+' Export this window’s complete copy to retain the visible changes.',true));
  }
  function restoreForms(){
    if(!store||!draft)return;
    for(const form of document.querySelectorAll('#main form,#record-body form')){
      if(form.id==='integration-mapping-form')continue;
      const key=formKey(form);binding.set(form,key);const fields=draft.forms[key];if(!fields)continue;
      [...form.elements].forEach((node,index)=>{
        if(['file','password','submit','button'].includes(node.type))return;const saved=fields[fieldKey(node,index)];if(!saved)return;
        if(Object.hasOwn(saved,'checked'))node.checked=Boolean(saved.checked);
        else if(node.multiple&&Array.isArray(saved.values))for(const option of node.options)option.selected=saved.values.includes(option.value);
        else if(Object.hasOwn(saved,'value')&&typeof saved.value==='string')node.value=saved.value;
      });
    }
    for(const [id,open] of Object.entries(draft.details||{})){const node=document.getElementById(id);if(node?.tagName==='DETAILS')node.open=Boolean(open);}
    for(const label of document.querySelectorAll('.copy-file-retained'))label.remove();
    for(const node of document.querySelectorAll('#main input[type=file]')){
      const ref=draft.files[fileSlot(node.id)];if(!ref)continue;
      const label=document.createElement('p');label.className='small copy-file-retained';label.textContent='Retained complete original: '+ref.name+' · '+ref.bytes.toLocaleString()+' bytes. Choose another file to replace this selection.';node.after(label);
    }
  }
  function beforeRender(){captureForms();}
  function afterRender(){if(!store)return;restoreForms();const open=$('#working-copy-panel')?.open;panel();if(open)$('#working-copy-panel').open=true;if(actionDepth)freeze();}
  function fileSlot(id){
    const {I}=state();if(id==='integration-customer-file')return id+'|'+($('#integration-reconcile-form [name=deliveryId]')?.value||I.deliveryId||'');
    return id;
  }
  async function retainFile(input){
    if(!input.files?.[0])return;
    const selection=store.selection,slot=fileSlot(input.id),file=input.files[0],at=serial,readId=crypto.randomUUID();fileReads.set(slot,readId);
    const limit=input.id==='integration-customer-file'?state().S.schema.delivery.customerFileLimit:input.id==='integration-schema-file'?2*1024*1024:FILE_LIMIT;
    const ref=await store.receiveFile(slot,file,limit,selection,()=>fileReads.get(slot)===readId);
    store.assertSelection(selection);
    draft.files[slot]=ref;dirty=true;serial++;
    await save();
    if(at===serial-1)afterRender();
    notify('Complete original '+file.name+' retained in this working copy.');
  }
  function trackFile(input){
    const file=input.files?.[0];if(!file)return Promise.resolve();
    const existing=inputReads.get(input);if(existing?.file===file)return existing.promise;
    const slot=fileSlot(input.id);fileFailures.delete(slot);
    const promise=retainFile(input).catch(error=>{fileFailures.set(slot,error);inputReads.delete(input);throw error;}).finally(()=>pendingFiles.delete(promise));
    pendingFiles.add(promise);inputReads.set(input,{file,promise});return promise;
  }
  async function selectedFile(id){
    const input=$('#'+id),selection=store.selection,slot=fileSlot(id),at=serial;
    if(input?.files?.[0])await trackFile(input);
    const ref=draft.files[slot];if(!ref)throw new Error('Choose the complete original file.');
    const file=await store.file(ref);store.assertSelection(selection);
    if(slot!==fileSlot(id))throw new Error('The selected receiving target changed while reading the original file. Choose it again.');
    return file;
  }
  async function adopt(){
    draft=clone(store.current.snapshot);dirty=false;lastError=null;serial++;binding=new WeakMap();rendering=true;
    selectionMismatch=Boolean(draft.ui?.context?.versionId&&draft.ui.context.versionId!==state().S.view.selectedVersionId);
    const {S,I}=state(),ui=draft.ui||{},integration=draft.integration||{};
    S.section=['sources','portfolios','review','changes','integration','publication','customer','handover'].includes(ui.section)?ui.section:'sources';
    S.table=Object.hasOwn(S.schema.tableColumns,ui.table||'')?ui.table:'projects';S.search=ui.search||'';S.sort=ui.sort||'';S.direction=ui.direction==='desc'?'desc':'asc';S.offset=Math.max(0,Number(ui.offset)||0);S.rows=null;S.detail=null;S.detailGeneration++;S.rowGeneration++;I.generation++;
    if($('#record-dialog').open)$('#record-dialog').close();
    I.document=null;I.draft=integration.draft?clone(integration.draft):null;I.mappingId=integration.mappingId||'';I.deliveryId=integration.deliveryId||'';I.selected=new Set();I.offset=0;I.receivingReviewer=integration.receivingReviewer||'';I.receivingNote=integration.receivingNote||'';
    S.pending=store.pending()[0]??null;render();rendering=false;afterRender();
    const selection=store.selection,documentRef=integration.document;
    if(documentRef){
      try{
        await openIntegrationDocument(documentRef.kind,documentRef.id);store.assertSelection(selection);
        I.selected=new Set((integration.selected||[]).filter(n=>Number.isSafeInteger(n)&&n>=0));I.offset=Math.max(0,Number(integration.offset)||0);I.receivingReviewer=integration.receivingReviewer||'';I.receivingNote=integration.receivingNote||'';
        render();
      }catch(error){notify('The working copy is retained. Its original selected document could not be opened: '+error.message,true);}
    }
    const context=ui.context;
    if(context?.record&&context.versionId===S.view.selectedVersionId&&context.portfolioId===S.view.selectedPortfolioId){
      try{await openRecord(context.record.table,{id:context.record.id});store.assertSelection(selection);restoreForms();}catch(error){notify('The retained record review remains in this copy: '+error.message,true);}
    }
  }
  async function command(command,target){
    if(actionDepth)throw new Error('Let this copy’s current operation finish before changing its selection.');
    const inputs={name:$('#working-copy-name')?.value.trim()||'Operator working copy',file:$('#working-copy-file')?.files[0],targetId:target?.value,slot:target?.dataset.slot};
    actionDepth++;freeze();for(const node of $('#working-copies').querySelectorAll('button,input,select'))node.disabled=true;
    try{const result=await copyCommand(command,inputs);const open=$('#working-copy-panel')?.open;panel();if(open)$('#working-copy-panel').open=true;return result;}
    finally{actionDepth--;thaw();for(const node of $('#working-copies').querySelectorAll('button,input,select'))node.disabled=false;}
  }
  async function copyCommand(command,inputs){
    if(command==='export'){
      await settleFiles();capture();const blob=await store.exportCopy(draft);download(blob,'OpenFEMA_'+store.current.name.replace(/[^a-zA-Z0-9_-]/g,'_')+'_Working_Copy.json');return;
    }
    if(command==='file'){const ref=draft.files[inputs.slot];download(await store.file(ref),ref.name);return;}
    if(command==='reload'){
      if(dirty&&!confirm('Reload the saved copies? Export the visible copy first to preserve any unsaved changes.'))return;
      await store.reload();await adopt();return;
    }
    await flush();const name=inputs.name;
    if(command==='save'){panel();return;}
    if(command==='rename'){await store.rename(name);panel();return;}
    if(command==='new'){await store.create(name+' — new');await adopt();return;}
    if(command==='duplicate'){await store.create(name+' — copy',draft);await adopt();return;}
    if(command==='choose'){await store.choose(inputs.targetId);await adopt();return;}
    if(command==='remove'){if(!confirm('Remove this saved browser working copy? Export it first if you need its preparation.'))return;await store.remove(store.current.id);await adopt();return;}
    if(command==='import'){
      const file=inputs.file;if(!file)throw new Error('Choose the complete exported working-copy JSON.');
      await store.importCopy(file);await adopt();notify('Complete original files and preparation imported as a separate copy.');return;
    }
    if(command==='context'){
      const context=clone(draft.ui.context);if(!context?.portfolioId||!context.versionId)throw new Error('This copy has no saved native portfolio selection.');
      await selectPortfolio(context.portfolioId,context.versionId);await adopt();return;
    }
  }
  function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
  async function run(action){if(actionDepth)throw new Error('The current working-copy action is still running.');actionDepth++;freeze();panel();try{await flush();return await action();}finally{actionDepth--;thaw();capture();void save().catch(error=>notify(error.message,true));panel();}}
  return {
    get ready(){return Boolean(store);},
    get busy(){return actionDepth>0;},
    async start(legacy=[]){
      store=await WorkingCopies.open(state().S.view.workspaceId);draft=clone(store.current.snapshot);
      for(const record of legacy){if(!store.root.requests.some(r=>r.operationId===record.operationId))await store.retainRequest(record);}
      if(!store.current.snapshot.integration.draft){
        let previous;try{previous=JSON.parse(sessionStorage.getItem('openfema-mapping-draft:'+store.root.workspaceId)||'null');}catch{}
        if(previous&&typeof previous.text==='string'){draft.integration.draft=previous;await store.save(draft);}
      }
      await adopt();
      document.addEventListener('input',event=>{if(event.target.closest('#main,#record-body')&&event.target.type!=='file')changed();});
      document.addEventListener('change',event=>{
        if(event.target.id==='working-copy-select'){void command('choose',event.target).catch(error=>{panel();notify(error.message,true);});return;}
        if(event.target.matches('#main input[type=file]')){void trackFile(event.target).catch(error=>notify(error.message,true));return;}
        if(event.target.closest('#main,#record-body'))changed();
      });
      document.addEventListener('click',event=>{const target=event.target.closest('[data-copy-command]');if(target){event.preventDefault();void command(target.dataset.copyCommand,target).catch(error=>notify(error.message,true));}});
      window.addEventListener('beforeunload',event=>{if(dirty||actionDepth){event.preventDefault();event.returnValue='';}});
      document.addEventListener('visibilitychange',()=>{if(document.hidden&&dirty)void save().catch(()=>{});});
    },
    capture,beforeRender,afterRender,restoreForms,flush,run,selectedFile,
    nativeSelectionChanged(){selectionMismatch=false;draft.ui.context=sourceContext();},
    pending:()=>store?.pending()||[],
    request:id=>store.request(id),
    async retainRequest(record){await flush();return store.retainRequest(record);},
    async completeRequest(id,result,revision){return store.completeRequest(id,result,revision);},
    changed,
    async checkpoint(){capture();await save();}
  };
}
