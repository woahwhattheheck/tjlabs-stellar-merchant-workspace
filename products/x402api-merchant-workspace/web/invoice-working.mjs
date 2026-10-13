// MIT. Named preparation, original request recovery and whole working-copy reopening.
import * as Draft from './invoice-drafts.mjs';
import * as Store from './invoice-draft-store.mjs';
export function mountInvoiceWorking(host){
 const $=id=>document.getElementById(id),form=$('create-form');
 let selected=null,dirty=false,serial=null,timer=null,epoch=0,generation=0,rows=[],attached=null,conflict=false,invalidEntered=false;
 const retained=new Map(),clone=value=>JSON.parse(JSON.stringify(value));
 const ownerKey=owner=>owner.storeId+':'+owner.tenantId;
 const current=()=>attached&&host.identity()&&Draft.same(attached,host.identity());
 function report(message){$('creation-note').textContent=message;host.notice(message);}
 function changed(){generation++;dirty=true;conflict=false;controls();clearTimeout(timer);timer=setTimeout(()=>flush().catch(error=>{conflict=true;report(error.message);controls();}),200);}
 function read(){
  if(!selected||selected.request)return;
  selected=Draft.edit(selected,{label:$('draft-label').value||'Untitled invoice',
   fields:{reference:form.elements.reference.value,title:form.elements.title.value,prices:[...$('rail-fields').querySelectorAll('[data-asset-id]')].map(input=>({
    assetId:input.dataset.assetId,amount:input.value,selected:[...form.querySelectorAll('[name=rail]')].find(c=>c.value===input.dataset.assetId).checked}))}});
  invalidEntered=false;changed();
 }
 async function flush(){
  Draft.need(!invalidEntered,'Correct the entered fields or explicitly reopen the saved revision before saving this working copy.');
  clearTimeout(timer);
  if(serial){await serial;if(dirty)return flush();return selected;}
  if(!selected||!dirty)return selected;
  const record=clone(selected),version=generation,selectedEpoch=epoch;
  serial=Store.save(record,record.revision||null).then(saved=>{
   if(epoch===selectedEpoch&&selected?.id===record.id){selected={...selected,revision:saved.revision,updatedAt:saved.updatedAt};dirty=generation!==version;conflict=false;}
   else if(retained.has(ownerKey(record.owner))){const old=retained.get(ownerKey(record.owner));if(old.record.id===record.id&&old.record.revision===record.revision)retained.set(ownerKey(record.owner),{...old,record:{...old.record,revision:saved.revision,updatedAt:saved.updatedAt},dirty:old.generation!==version});}
   return saved;
  }).finally(()=>{serial=null;controls();});
  const saved=await serial;if(dirty&&epoch===selectedEpoch)return flush();return saved;
 }
 function renderOptions(){
  const select=$('draft-list'),old=selected?.id;select.replaceChildren(new Option('Choose saved working copy',''));
  for(const row of rows)select.append(new Option(row.label+' · '+(row.receipt?'Invoice saved':row.request?'Original request retained':'Preparing'),row.id));
  if(old&&!rows.some(r=>r.id===old))select.append(new Option(selected.label+' · Unsaved',old));select.value=old||'';
 }
 async function reloadList(){const owner=attached,at=epoch;if(!owner)return;const loaded=await Store.list(owner);if(at!==epoch)return;rows=loaded;renderOptions();}
 function render(){
  const record=selected;renderOptions();$('draft-editor').hidden=!record;
  if(!record){controls();return;}
  $('draft-label').value=record.label;form.elements.reference.value=record.fields.reference;form.elements.title.value=record.fields.title;
  const rails=$('rail-fields');rails.replaceChildren();
  for(const rail of record.terms.template.rails){
   const field=record.fields.prices.find(p=>p.assetId===rail.assetId),card=document.createElement('div');card.className='rail';
   const label=document.createElement('label');label.className='rail-choice';
   const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.name='rail';checkbox.value=rail.assetId;checkbox.checked=field.selected;
   const span=document.createElement('span');span.textContent=rail.label;label.append(checkbox,span);
   const network=document.createElement('p');network.className='muted';network.textContent=rail.network;
   const input=document.createElement('input');input.type='text';input.inputMode='decimal';input.autocomplete='off';input.className='rail-amount';input.dataset.assetId=rail.assetId;input.value=field.amount;input.maxLength=120;input.setAttribute('aria-label',rail.label+' amount');
   const detail=document.createElement('div');detail.className='rail-atomic';const show=()=>{try{detail.textContent=Draft.atomic(input.value,rail.decimals)+' atomic units';}catch{detail.textContent='Up to '+rail.decimals+' decimal places';}};show();input.addEventListener('input',show);
   card.append(label,network,input,detail);rails.append(card);
  }
  $('draft-identity').textContent=record.id+' · Revision '+record.revision;
  $('draft-terms-content').textContent=JSON.stringify(record.terms,null,2);
  $('draft-request-content').textContent=record.request?JSON.stringify(record.request,null,2):'Review the fields, selected payment options and retained terms before saving this invoice.';
  $('creation-note').textContent=record.lastError||(record.receipt?'The original invoice was received. Open it to continue payment and delivery.':record.request?'The exact original request is saved. Read its status or continue this same request.':dirty?'Saving this working copy…':'Working copy saved in this browser.');
  controls();
 }
 function controls(){
  const disabled=host.busy()||!current(),locked=disabled||!!selected?.request,paused=disabled||host.capturing();
  $('draft-new').disabled=disabled;$('draft-list').disabled=disabled;$('draft-open').disabled=disabled;
  for(const el of form.querySelectorAll('input:not([type=file]),select')){el.disabled=locked;}
  $('draft-label').disabled=locked;
  $('draft-save').disabled=disabled||!selected;
  $('draft-download').disabled=!selected||host.busy();
  $('draft-reload').disabled=disabled||!selected?.revision;
  $('draft-remove').disabled=disabled||!selected||!!selected.request&&!selected.receipt;
  $('draft-adopt').hidden=!selected||!!selected.request||!current()||Draft.same(selected.terms,Draft.terms(host.state().config));
  $('draft-adopt').disabled=disabled;
  $('draft-read').hidden=!selected?.request;$('draft-read').disabled=paused||!selected?.request;
  $('draft-open-invoice').hidden=!selected?.receipt;$('draft-open-invoice').disabled=disabled;
  $('create-submit').hidden=!!selected?.receipt;
  $('create-submit').textContent=selected?.request?'Continue original invoice':'Review and save invoice';
  $('create-submit').disabled=paused||!selected||conflict||invalidEntered;
  $('draft-storage-state').textContent=conflict||invalidEntered?'Working copy needs attention':dirty?'Unsaved changes':selected?'Saved in this browser':'No working copy selected';
  $('draft-legacy').hidden=!attached||!sessionStorage.getItem('merchant.pending-invoice.v1.'+attached.tenantId);
 }
 async function saveAndList(){await flush();await reloadList();render();}
 async function choose(id){
  await flush();await reloadList();const row=rows.find(r=>r.id===id);Draft.need(row,'Choose a current retained working copy.');selected=clone(row);dirty=false;conflict=false;invalidEntered=false;generation++;render();
 }
 async function newDraft(){
  await flush();selected=Draft.create(attached,host.state().config);dirty=true;generation++;render();await saveAndList();
 }
 function download(record=selected,name){
  Draft.need(!invalidEntered,'Correct the entered fields before downloading their complete working copy.');
  Draft.need(record,'Select a working copy.');const raw=Draft.encode(record),url=URL.createObjectURL(new Blob([raw],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download=name||'invoice-working-copy-'+record.id+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
 }
 async function commitOutcome(before,after,selectedEpoch){
  const saved=await Store.save(after,before.revision);
  if(epoch===selectedEpoch&&selected?.id===before.id){selected=saved;dirty=false;render();await reloadList();}
  return saved;
 }
 async function readOriginal(){
  await flush();const original=clone(selected),at=epoch;Draft.need(original.request,'Select the original retained request.');
  const response=await host.api('/api/orders/'+original.id);
  const observed=Draft.observe(original,response.order);await commitOutcome(original,observed,at);
  return observed;
 }
 async function submit(){
  Draft.need(!invalidEntered&&!conflict,'Correct the entered fields or reopen the saved revision before saving this invoice.');
  await flush();
  Draft.need(!invalidEntered&&!conflict,'Keep the exact visible reviewed fields before saving this invoice.');Draft.need(current()&&host.state().mode!=='review','Connect to the original operating merchant.');
  if(!selected.request){
   selected=Draft.prepare(selected,host.state().config);dirty=true;generation++;
   // The whole immutable request must commit before the original writer is called.
   await flush();render();
  }
  const original=clone(selected),at=epoch;
  try{
   const response=await host.api('/api/orders',{method:'POST',body:original.request});
   const observed=Draft.observe(original,response.order);await commitOutcome(original,observed,at);
   if(current()&&epoch===at){await host.received(original.id);report('Invoice saved. Its working copy and original request remain available.');}
  }catch(error){
   const failed={...original,lastError:String(error.message||error).slice(0,2000)};
   try{await commitOutcome(original,failed,at);}catch(storageError){report('The original request remains retained. '+error.message+' '+storageError.message);}
   throw error;
  }
 }
 async function openFile(file){
  Draft.need(file&&file.size<=Draft.MAX_FILE_BYTES,'Select a complete working-copy JSON file up to 256 KiB.');
  const at=epoch,owner=clone(attached),record=Draft.decode(await file.text(),owner);Draft.need(at===epoch&&current(),'Reconnect before opening this working copy.');
  await flush();await reloadList();const previous=rows.find(r=>r.id===record.id);
  if(previous){Draft.need(Draft.same({...previous,revision:0,updatedAt:''},{...record,revision:0,updatedAt:''}),'This browser already has a different edition of this working copy. Keep both files; reopen the saved revision to continue its original request.');selected=clone(previous);}
  else {Draft.need(confirm('Open “'+record.label+'” for this merchant? '+(record.request?'Its original invoice request will remain fixed.':'Its retained terms and entered fields will be restored.')),'Working-copy opening cancelled.');selected=await Store.save({...record,revision:0},null);}
  dirty=false;conflict=false;generation++;render();await reloadList();
 }
 async function recoverLegacy(){
  const key='merchant.pending-invoice.v1.'+attached.tenantId,raw=sessionStorage.getItem(key);Draft.need(raw,'No earlier tab request is selected.');
  const payload=JSON.parse(raw),at=epoch;Draft.need(payload&&typeof payload.id==='string','Keep the original earlier request.');
  const response=await host.api('/api/orders/'+encodeURIComponent(payload.id));
  const order=response.order;Draft.need(order&&order.id===payload.id&&order.reference===payload.reference&&order.title===payload.title&&Draft.same(order.frozen.rails.map(r=>({assetId:r.assetId,amountAtomic:r.amountAtomic})),payload.prices),'The earlier tab request does not match this original saved invoice.');
  Draft.need(at===epoch&&current(),'Reconnect to receive the earlier invoice.');
  const config={publicOrigin:new URL(order.frozen.request.url).origin,template:order.frozen.template};
  let record=Draft.create(attached,config,{id:payload.id});record.label=payload.reference;
  record.fields={reference:payload.reference,title:payload.title,prices:config.template.rails.map(rail=>{const p=payload.prices.find(p=>p.assetId===rail.assetId);return {assetId:rail.assetId,selected:!!p,amount:p?Draft.decimal(p.amountAtomic,rail.decimals):''};})};
  record=Draft.prepare(record,config);record=Draft.observe(record,order);await flush();await reloadList();
  const old=rows.find(r=>r.id===record.id);
  if(old){Draft.need(old.request&&Draft.same(old.request,record.request),'Keep the existing original working copy.');selected=clone(old);}
  else selected=await Store.save(record,null);
  sessionStorage.removeItem(key);dirty=false;generation++;render();await reloadList();
 }
 function run(work){return host.action(work);}
 function enteredFailure(error){invalidEntered=true;report(error.message);controls();}
 form.addEventListener('input',()=>{try{read();}catch(error){enteredFailure(error);}});
 form.addEventListener('change',()=>{try{read();}catch(error){enteredFailure(error);}});
 $('draft-label').addEventListener('input',()=>{try{read();}catch(error){enteredFailure(error);}});
 form.addEventListener('submit',event=>{event.preventDefault();run(submit);});
 $('draft-new').addEventListener('click',()=>run(newDraft));
 $('draft-list').addEventListener('change',()=>run(()=>choose($('draft-list').value)));
 $('draft-save').addEventListener('click',()=>run(saveAndList));
 $('draft-download').addEventListener('click',()=>{try{download();}catch(error){report(error.message);}});
 $('draft-open').addEventListener('click',()=>$('draft-file').click());
 $('draft-file').addEventListener('change',event=>{const file=event.target.files[0];event.target.value='';if(file)run(()=>openFile(file));});
 $('draft-reload').addEventListener('click',()=>run(async()=>{Draft.need(!(dirty||invalidEntered)||confirm('Replace the entered copy with the saved revision? Download the entered copy first if you need to retain both.'),'Saved revision was not opened.');dirty=false;conflict=false;invalidEntered=false;await choose(selected.id);}));
 $('draft-remove').addEventListener('click',()=>run(async()=>{await flush();Draft.need(confirm('Remove this browser working copy? The saved invoice and any downloaded copies remain.'),'Working copy retained.');await Store.remove(selected);selected=null;render();await reloadList();}));
 $('draft-adopt').addEventListener('click',()=>run(async()=>{await flush();Draft.need(confirm('Adopt the current configured terms? Review all retained and newly available payment options before creating the invoice.'),'Original terms retained.');selected=Draft.adopt(selected,host.state().config);dirty=true;generation++;render();await saveAndList();}));
 $('draft-read').addEventListener('click',()=>run(readOriginal));
 $('draft-open-invoice').addEventListener('click',()=>run(async()=>{await readOriginal();await host.received(selected.id);}));
 $('draft-legacy-read').addEventListener('click',()=>run(recoverLegacy));
 $('draft-legacy-download').addEventListener('click',()=>{const raw=sessionStorage.getItem('merchant.pending-invoice.v1.'+attached.tenantId),url=URL.createObjectURL(new Blob([raw],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='earlier-original-invoice-request.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);});
 window.addEventListener('beforeunload',event=>{if(dirty||serial||invalidEntered){event.preventDefault();event.returnValue='';}});
 return {
  async connect(){
   const owner=Draft.identity(host.identity());epoch++;attached=owner;const old=retained.get(ownerKey(owner));
   if(old){selected=old.record;dirty=old.dirty;generation=old.generation;retained.delete(ownerKey(owner));}
   else {selected=null;dirty=false;generation++;}
   conflict=false;invalidEntered=false;await reloadList();render();
  },
  async show(){Draft.need(current(),'Connect to this merchant first.');$('create-panel').hidden=false;await reloadList();if(!selected){if(rows.length)await choose(rows[0].id);else await newDraft();}render();},
  reset(){clearTimeout(timer);if(selected&&attached)retained.set(ownerKey(attached),{record:clone(selected),dirty,generation});epoch++;attached=null;selected=null;dirty=false;conflict=false;invalidEntered=false;rows=[];$('create-panel').hidden=true;},
  controls,flush,
 };
}
