/* MIT. Continue complete Event mapping work inside the original native operator. */
import { eventMappingHash, eventMappingBytes } from './mapping-working.mjs';
import { createEventMappingNativeRuntime, renderEventMappingNativeHTML } from './mapping-native-runtime.mjs';
import { mountEventMappingWorking } from './mapping-working-ui.mjs';
import { mountEventMappingReview } from './mapping-review-ui.mjs';

export const EVENT_MAPPING_NATIVE_DESK='stellar-forge.event-mapping-native-desk.v1';
const MAX=192*1024*1024, ID=/^[a-f0-9]{32}$/, HASH=/^[a-f0-9]{64}$/;
const clone=value=>JSON.parse(JSON.stringify(value));
const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}':JSON.stringify(value);
const need=(yes,message)=>{if(!yes)throw Error(message);};
const work=value=>value?.working??value;
const original=value=>work(value)?.original;
const shape=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));

/* Retained source is data. Only the installed runtime supplied by the caller may execute. */
export function createEventMappingNativeDeskAPI({workingAPI,reviewAPI,parserHash}={}){
 need(workingAPI&&reviewAPI&&HASH.test(parserHash),'Provide the complete installed mapping runtime.');
 function document(value,workspace){
  const w=work(value),c=w?.original?.comparison;
  need(['stellar-forge.event-mapping-working-copy.v1','stellar-forge.event-mapping-colleague-working.v1'].includes(value?.schema)&&
   c?.workspace_id===workspace&&ID.test(c.input_id??'')&&typeof c.programme==='string'&&c.programme.length<=24&&
   HASH.test(c.receiver?.core_sha256??'')&&w.original.files,'Keep the complete mapping document in its original workspace.');
  if(c.receiver.core_sha256===parserHash)return reviewAPI.wrap(value);
  return clone(value);
 }
 function native(value,workspace){
  need(value&&value.workspace_id===workspace&&typeof value.programme==='string'&&value.programme.length<=24&&
   (value.input===null||ID.test(value.input?.id??''))&&Array.isArray(value.fields)&&value.fields.length<=100&&
   value.fields.every(f=>typeof f?.name==='string'&&typeof f.pointer==='string'&&f.name.length<=48&&f.pointer.length<=2000)&&
   typeof value.note==='string'&&typeof value.columns==='string'&&value.mappingReview&&typeof value.mappingReview==='object',
   'Keep the complete displaced native form and original workspace identity.');
  return clone(value);
 }
 function reopen(value){
  need(shape(value,['schema','workspace_id','active_id','entries','native_history'])&&value.schema===EVENT_MAPPING_NATIVE_DESK&&ID.test(value.workspace_id??'')&&
   Array.isArray(value.entries)&&Array.isArray(value.native_history),'Open the complete saved native mapping desk.');
  const result=clone(value),seen=new Set();
  for(const entry of result.entries){
   need(shape(entry,['id','label','origin','original_text','working','view','displaced'])&&HASH.test(entry.id??'')&&!seen.has(entry.id)&&
    typeof entry.label==='string'&&entry.label.length<=1000&&typeof entry.original_text==='string'&&
    eventMappingHash(entry.original_text)===entry.id&&entry.view&&typeof entry.view==='object'&&!Array.isArray(entry.view)&&
    JSON.stringify(entry.view).length<=10000&&Array.isArray(entry.displaced),'Keep every complete editor edition and its exact original text.');
   seen.add(entry.id);const initial=document(JSON.parse(entry.original_text),result.workspace_id);
   entry.working=document(entry.working,result.workspace_id);
   need(canonical(original(initial))===canonical(original(entry.working)),'The current editor must retain its original source windows.');
   for(let i=0;i<entry.displaced.length;i++){entry.displaced[i]=document(entry.displaced[i],result.workspace_id);need(canonical(original(initial))===canonical(original(entry.displaced[i])),'A displaced editor belongs to another source pair.');}
   const o=entry.origin;need(o&&['saved-action','native-comparison','working-file'].includes(o.kind),'Keep the original receiving source.');
   if(o.kind==='saved-action'){
    const a=o.action,d=a?.request?.mapping_working_source,c=original(initial).comparison;
    need(a.workspace_id===result.workspace_id&&a.programme===c.programme&&a.request.input_id===c.input_id&&
     a.request.action==='review'&&ID.test(a.id??'')&&d?.id===entry.id&&d.sha256===entry.id&&d.bytes===eventMappingBytes(entry.original_text),
     'The complete source differs from its original saved native action.');
   }
  }
  need(result.active_id===null||seen.has(result.active_id),'Select an existing complete editor.');
  for(const item of result.native_history){need(shape(item,['id','label','snapshot'])&&typeof item.label==='string'&&item.label.length<=1000&&HASH.test(item.id??'')&&eventMappingHash(canonical(item.snapshot))===item.id,'Keep each complete displaced native form.');native(item.snapshot,result.workspace_id);}
  need(eventMappingBytes(JSON.stringify(result))<=MAX,'The complete desk exceeds192MiB. Export this full desk and open a separate complete desk; no editions were removed.');
  return result;
 }
 function empty(workspace){return reopen({schema:EVENT_MAPPING_NATIVE_DESK,workspace_id:workspace,active_id:null,entries:[],native_history:[]});}
 function add(value,{text,label,origin:source}){
  const next=reopen(value),id=eventMappingHash(text);
  const existing=next.entries.find(e=>e.id===id);
  if(existing){next.active_id=id;return reopen(next);}
  const full=document(JSON.parse(text),next.workspace_id);
  next.entries.push({id,label,origin:clone(source),original_text:text,working:full,view:{},displaced:[]});next.active_id=id;return reopen(next);
 }
 function update(value,id,session){
  const next=reopen(value),entry=next.entries.find(e=>e.id===id);need(entry,'Select the original retained editor.');
  entry.working=session.working;entry.view=session.view;entry.displaced=session.displaced;return reopen(next);
 }
 function retainNative(value,snapshot,label){
  const next=reopen(value);native(snapshot,next.workspace_id);const id=eventMappingHash(canonical(snapshot));
  if(!next.native_history.some(e=>e.id===id))next.native_history.push({id,label,snapshot:clone(snapshot)});
  return reopen(next);
 }
 function selected(value){const d=reopen(value),entry=d.entries.find(e=>e.id===d.active_id);need(entry,'Open a complete mapping editor.');need(original(entry.working).comparison.receiver.core_sha256===parserHash,'This historic document uses another original parser. Download its unchanged JSON and original saved HTML; the current installed editor cannot reinterpret it.');return entry;}
 return Object.freeze({empty,reopen,add,update,retainNative,selected,serialize:value=>JSON.stringify(reopen(value))+'\n'});
}

export function mountEventMappingNativeWorkspace(root,{workspaceId,loadAssets,getNative,receiveSaved,receiveCurrent,compareNative,adoptNative,restoreNative,onMessage}={}){
 need(root&&workspaceId&&loadAssets&&getNative&&receiveSaved&&receiveCurrent&&compareNative&&adoptNative&&restoreNative,'Provide the existing native Event operator connections.');
 const doc=root.ownerDocument,win=doc.defaultView;
 let desk=null,assets=null,api=null,workingAPI=null,reviewAPI=null,editor=null,destroyed=false,loading=null,generation=0,busy=false,outerLocked=false,preview=null,saveTimer=null,writeChain=Promise.resolve(),dbPromise=null,persistRevision=0,committedRevision=0;
 const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n;};
 const heading=el('h2','Complete mapping desk'),intro=el('p','Continue complete mapping and colleague work here. Compare and adopt into the original native form explicitly; its Review and Apply remain separate decisions.');
 const status=el('p','Open complete work from a saved action, the current comparison or a working JSON.','emn-status');status.setAttribute('role','status');
 const bar=el('div',undefined,'emn-toolbar'),list=el('div',undefined,'emn-editions'),comparison=el('section',undefined,'emn-comparison'),history=el('details'),surface=el('div',undefined,'emn-editor');
 history.append(el('summary','Displaced native forms'));
 root.classList.add('event-mapping-native-desk');root.replaceChildren(heading,intro,status,bar,list,comparison,history,surface);
 function message(text,error=false){if(destroyed)return;status.textContent=text;status.dataset.error=String(error);onMessage?.(text,error);}
 function button(label,run){const b=el('button',label);b.type='button';b.addEventListener('click',()=>guard(run));return b;}
 async function guard(run){if(destroyed||busy||outerLocked)return;busy=true;setLocks();try{await run();}catch(error){message(error.message,true);}finally{busy=false;if(!destroyed)setLocks();}}
 function setLocks(){for(const e of bar.querySelectorAll('button,input'))e.disabled=busy||outerLocked;for(const e of list.querySelectorAll('button'))e.disabled=busy||outerLocked;for(const e of comparison.querySelectorAll('button'))e.disabled=busy||outerLocked;for(const e of history.querySelectorAll('button'))e.disabled=busy||outerLocked;surface.inert=busy||outerLocked;}
 async function ready(){
  need(!destroyed,'This mapping desk is closed.');
  if(api)return;
  if(!loading)loading=(async()=>{const current=await loadAssets();need(!destroyed,'This mapping desk closed while installed source was read.');
   const runtime=createEventMappingNativeRuntime(current);workingAPI=runtime.workingAPI;reviewAPI=runtime.reviewAPI;assets=current;
   api=createEventMappingNativeDeskAPI({workingAPI,reviewAPI,parserHash:eventMappingHash(current.parserSource)});
   desk=api.empty(workspaceId());})();
  try{await loading;}catch(error){loading=null;throw error;}
 }
 function download(name,text,type='application/json;charset=utf-8'){
  need(eventMappingBytes(text)<=MAX,'The complete file exceeds192MiB. Preserve this open desk and original sources; no content was omitted.');
  const url=win.URL.createObjectURL(new win.Blob([text],{type})),a=el('a');a.href=url;a.download=name;doc.body.append(a);a.click();a.remove();win.setTimeout(()=>win.URL.revokeObjectURL(url),60000);
 }
 function capture(){if(editor&&desk){desk=api.update(desk,desk.active_id,editor.sessionSnapshot());}return desk;}
 function changed(){if(destroyed)return;generation++;preview=null;comparison.replaceChildren();win.clearTimeout(saveTimer);saveTimer=win.setTimeout(()=>{try{capture();persist().catch(e=>message(e.message,true));}catch(e){message(e.message,true);}},500);}
 function database(){
  if(!win.indexedDB)return Promise.reject(Error('Browser whole-desk storage is unavailable. Download complete desk JSON before closing.'));
  if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{const r=win.indexedDB.open('stellar-forge-event-mapping-desk',1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('desks'))r.result.createObjectStore('desks');};r.onerror=()=>reject(Error('Browser whole-desk storage could not open. Download complete desk JSON.'));r.onsuccess=()=>resolve(r.result);r.onblocked=()=>reject(Error('Close an older Event desk tab or download complete desk JSON; browser storage is busy.'));});
  return dbPromise;
 }
 async function persist(){
  if(!desk)return;
  const raw=api.serialize(capture()),key=desk.workspace_id,revision=++persistRevision;
  const task=writeChain.catch(()=>{}).then(async()=>{const db=await database();await new Promise((resolve,reject)=>{const t=db.transaction('desks','readwrite');t.objectStore('desks').put(raw,key);t.oncomplete=resolve;t.onerror=t.onabort=()=>reject(Error('The browser could not retain the complete mapping desk. Download its whole JSON now; current work remains open.'));});committedRevision=revision;});
  writeChain=task;return task;
 }
 async function restoreCheckpoint(){
  await ready();capture();const start=generation;await writeChain.catch(()=>{});need(!destroyed&&generation===start,'Current work changed while browser storage settled. Inspect the checkpoint again.');const db=await database();const raw=await new Promise((resolve,reject)=>{const t=db.transaction('desks','readonly'),r=t.objectStore('desks').get(desk.workspace_id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(Error('The complete browser checkpoint could not be read.'));});
  need(!destroyed&&generation===start,'Current work changed while the checkpoint was read. Inspect it again.');need(typeof raw==='string','No complete desk checkpoint exists for this workspace.');
  offerDesk(api.reopen(JSON.parse(raw)),'Complete browser checkpoint');
 }
 function compatible(value){need(value.workspace_id===workspaceId(),'Open this complete desk in its original native workspace.');return value;}
 function offerDesk(candidate,label){
  compatible(candidate);const start=generation;comparison.replaceChildren(el('h3','Inspected complete desk'),el('p',label+' · '+candidate.entries.length+' editors and '+candidate.native_history.length+' displaced native forms. Current editors remain until explicit adoption.'));
  comparison.append(button('Download current complete desk',()=>download('event-mapping-native-desk-current.json',api.serialize(capture()))),button('Open inspected desk and retain current editions',async()=>{
   need(generation===start,'Current work changed after inspection. Inspect the complete desk again.');capture();
   const merged=clone(candidate);
   for(const entry of desk.entries){const prior=merged.entries.find(x=>x.id===entry.id);if(!prior)merged.entries.push(entry);else if(canonical(prior)!==canonical(entry)){prior.displaced.push(entry.working,...entry.displaced);}}
   for(const entry of desk.native_history)if(!merged.native_history.some(x=>x.id===entry.id))merged.native_history.push(entry);
   const next=api.reopen(merged);unmount();desk=next;generation++;preview=null;comparison.replaceChildren();render();mountSelected();await persist();message('Opened the complete desk. All displaced complete editors and native forms are retained.');
  }));setLocks();
 }
 function unmount(){if(editor){capture();editor.destroy();editor=null;}surface.replaceChildren();}
 function mountSelected(){
  if(!desk?.active_id)return;const entry=desk.entries.find(e=>e.id===desk.active_id);
  if(original(entry.working).comparison.receiver.core_sha256!==eventMappingHash(assets.parserSource)){
   surface.append(el('p','This historical edition uses another original parser. Its complete source remains downloadable. Use its saved action’s original frozen HTML independently.'));return;
  }
  editor=mountEventMappingWorking(surface,{api:workingAPI,reviewApi:reviewAPI,mountReview:mountEventMappingReview,initial:entry.working,view:entry.view,retainedEditions:entry.displaced,onChange:changed,onMessage:(text,{error=false}={})=>message(text,error),onSaveHTML:({value,view,name})=>download(name,renderEventMappingNativeHTML(value,{...assets,view}),'text/html;charset=utf-8')});
  setLocks();
 }
 function render(){
  list.replaceChildren();
  for(const entry of desk.entries){const row=el('div',undefined,'emn-edition'),c=original(entry.working).comparison;
   row.append(el('strong',(entry.id===desk.active_id?'Open · ':'')+entry.label),el('p',c.programme+' · input '+c.input_id),button('Open retained editor',async()=>{capture();unmount();desk.active_id=entry.id;generation++;preview=null;comparison.replaceChildren();mountSelected();render();await persist();}),button('Download exact received JSON',()=>download('mapping-original-'+entry.id.slice(0,16)+'.json',entry.original_text)));
   list.append(row);
  }
  history.replaceChildren(el('summary','Displaced native forms ('+desk.native_history.length+')'));
  for(const record of desk.native_history){
   const box=el('div',undefined,'emn-edition');box.append(el('strong',record.label),el('p',record.snapshot.programme+' · input '+(record.snapshot.input?.id||'none')),button('Download complete original form',()=>download('event-native-form-'+record.id.slice(0,16)+'.json',JSON.stringify(record.snapshot,null,2)+'\n')),button('Restore this native form',async()=>{
    const before=getNative();desk=api.retainNative(capture(),before,'Before restoring '+record.label);await persist();await restoreNative(clone(record.snapshot),clone(before));generation++;preview=null;comparison.replaceChildren();render();message('Restored the selected native form. Original action execution remains explicit; the displaced form is retained.');
   }));history.append(box);
  }setLocks();
 }
 async function openText(text,label,origin){
  await ready();capture();const next=api.add(desk,{text,label,origin});unmount();desk=next;generation++;preview=null;comparison.replaceChildren();render();mountSelected();await persist();message('Opened complete mapping work. Edit, issue or receive colleague work, then compare with the current native form before adopting.');
 }
 async function openSaved(action){
  await ready();const start=generation,copy=clone(action);const file=await receiveSaved(copy);
  need(!destroyed&&start===generation,'Current editor changed while the original saved source was received. Reopen the saved action to continue.');const text=new win.TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(file.bytes);
  await openText(text,'Saved action '+copy.id,{kind:'saved-action',action:copy});
 }
 async function openCurrent(){
  await ready();const start=generation,before=canonical(getNative()),result=await receiveCurrent();
  need(!destroyed&&generation===start&&canonical(getNative())===before,'Native source or desk changed while the complete current comparison was received. Try again.');
  await openText(result.text,'Native comparison '+result.comparison_sha256,{kind:'native-comparison',comparison_sha256:result.comparison_sha256});
 }
 async function inspectNative(){
  await ready();capture();const entry=api.selected(desk),selected=clone(entry.working),native=getNative(),start=generation;
  const w=work(selected),s=workingAPI.status(w);need(s.ready,s.errors.join(' '));
  const actual=await compareNative(w);
  need(!destroyed&&generation===start&&canonical(getNative())===canonical(native),'Current native form or editor changed during comparison. Compare again.');
  need(canonical(actual)===canonical(w.comparison),'The native comparison has changed since this complete working edition. Keep its full history and select a current original comparison explicitly.');
  preview={id:entry.id,working:selected,native:clone(native),generation:start,actual};
  comparison.replaceChildren(el('h3','Compare before native adoption'),el('p','Original source '+w.comparison.programme+' / '+w.comparison.input_id+'. Adoption replaces the current native field form and source selection; its complete displaced form is retained. Review and Apply are separate.'));
  const grid=el('div',undefined,'emn-grid');
  for(const [title,value]of [['Current native form',{programme:native.programme,input_id:native.input?.id,fields:native.fields,review:native.mappingReview}],['Complete editor selected for adoption',{programme:w.comparison.programme,input_id:w.comparison.input_id,fields:w.draft.fields,reviewer:w.draft.reviewer,note:w.draft.note,decisions:w.draft.decisions,colleague_history:selected.review_receiving??null}]]){
   const column=el('div');column.append(el('h4',title),el('pre',JSON.stringify(value,null,2)));grid.append(column);
  }comparison.append(grid,button('Retain full work and adopt into native form',async()=>{
   capture();const p=preview;need(p&&p.generation===generation&&p.id===desk.active_id&&canonical(api.selected(desk).working)===canonical(p.working)&&canonical(getNative())===canonical(p.native),'The comparison is stale. Compare the current native form and editor again.');
   desk=api.retainNative(desk,p.native,'Before adopting '+p.id.slice(0,16));await persist();
   need(generation===p.generation&&canonical(getNative())===canonical(p.native),'Work changed while the displaced form was saved. Compare again.');
   await adoptNative(clone(p.working),clone(p.native),p.actual);generation++;preview=null;comparison.replaceChildren();render();await persist();message('Complete work is retained and selected in the original native form. Continue its Review complete source window, then the original Apply decision.');
  }));setLocks();
 }
 const fileLabel=el('label','Open complete working JSON or desk'),file=el('input');file.type='file';file.accept='.json,application/json';file.addEventListener('change',()=>guard(async()=>{
  const chosen=file.files[0];if(!chosen)return;need(chosen.size>0&&chosen.size<=MAX,'Choose the complete file within192MiB.');await ready();const start=generation,raw=await chosen.arrayBuffer();need(!destroyed&&generation===start,'The desk changed during file reading. Select the original file again.');
  const text=new win.TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(raw);need(eventMappingBytes(text)===raw.byteLength,'Keep the exact complete UTF-8 file.');
  const value=JSON.parse(text);if(value.schema===EVENT_MAPPING_NATIVE_DESK)offerDesk(api.reopen(value),'Selected file '+chosen.name);else await openText(text,'Working file '+chosen.name,{kind:'working-file',name:chosen.name});file.value='';
 }));fileLabel.append(file);
 bar.append(button('Open current complete comparison',openCurrent),button('Compare editor with native form',inspectNative),button('Download complete desk JSON',async()=>{await ready();download('event-mapping-native-desk.json',api.serialize(capture()));message('Complete desk download requested. It contains every retained editor, original source and displaced native form.');}),button('Save complete browser checkpoint',async()=>{await ready();await persist();message('The complete mapping desk was saved in this browser for this original workspace. Restore is explicit.');}),button('Inspect browser checkpoint',restoreCheckpoint),fileLabel);
 const unload=event=>{if(editor?.changed||persistRevision>committedRevision){event.preventDefault();event.returnValue='';}};
 win.addEventListener('beforeunload',unload);
 return Object.freeze({openSaved:action=>guard(()=>openSaved(action)),openCurrent:()=>guard(openCurrent),capture,async retainNative(snapshot,label){await ready();desk=api.retainNative(capture(),snapshot,label);render();await persist();},lock(value){outerLocked=Boolean(value);setLocks();},async flush(){win.clearTimeout(saveTimer);await ready();await persist();},async destroy(){win.clearTimeout(saveTimer);const pending=desk?persist():Promise.resolve();destroyed=true;generation++;unmount();win.removeEventListener('beforeunload',unload);root.replaceChildren();try{await pending;}catch(error){onMessage?.(error.message,true);throw error;}finally{await writeChain.catch(()=>{});if(dbPromise)(await dbPromise.catch(()=>null))?.close();}}});
}
