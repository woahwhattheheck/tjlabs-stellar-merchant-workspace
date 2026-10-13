// SPDX-License-Identifier: MIT
import {COLLECTION_LIMITS,createCollection,appendFiles,updateItem,renameCollection,retainPreview,receiveCollection,collectionProgress,mappingSignature,encodeBytes,decodeBytes} from './source-collection-model.mjs';
/** Local working collections; every financial mutation uses the existing original-source editor. */
export function installSourceCollections({root,workspaceId,getImports,readIndex,readCollection,saveCollection,uuid,defaultMapping,openItem,download,notice,run}){
 const node=(tag,text,attributes={})=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);for(const [k,v]of Object.entries(attributes)){if(k==='class')n.className=v;else n.setAttribute(k,String(v));}return n;};
 const button=(label,work)=>{const n=node('button',label,{type:'button'});n.addEventListener('click',()=>perform(work));return n;};
 const section=node('section',undefined,{class:'panel'}),title=node('h2','Original statement collections');
 const help=node('p','Keep a whole bank delivery together. Open each original in the existing source editor, retain its account statements, and return here for the remaining files. Every working file and interpretation is included in the collection download.',{class:'small muted'});
 const toolbar=node('div',undefined,{class:'actions'}),select=node('select',undefined,{'aria-label':'Saved statement collection'});
 const create=button('New collection',()=>newCollection()),receive=node('input',undefined,{type:'file',accept:'.json,application/json'}),receiveLabel=node('label','Open collection as a new copy',{class:'small'});receiveLabel.append(receive);
 const exportButton=button('Download complete collection',async()=>{await flush().catch(()=>{});requireActive();download('bank-source-collection-'+active.id+'.json',JSON.stringify(active));});
 toolbar.append(select,create,exportButton,receiveLabel);
 const name=node('input',undefined,{maxlength:160,'aria-label':'Collection name'}),nameLabel=node('label','Collection name');nameLabel.append(name);
 const add=node('input',undefined,{type:'file',multiple:'multiple',accept:'.ofx,.qfx,.xml,.csv,.tsv,.txt'}),addLabel=node('label','Add original statement files');addLabel.append(add);
 const search=node('input',undefined,{type:'search','aria-label':'Search original files',placeholder:'Filename, account or source date'}),filter=node('select',undefined,{'aria-label':'Intake status'});
 for(const [value,label]of [['','All originals'],['NEEDS_REVIEW','Needs source review'],['READY_TO_RETAIN','Ready to retain'],['PARTLY_RETAINED','Partly retained'],['RETAINED','Retained'],['PRIOR_INTERPRETATION','Earlier interpretation'],['EXCLUDED','Excluded'],['EXCLUSION_NOTE_REQUIRED','Exclusion note needed'],['NO_STATEMENTS','No statement sections']])filter.append(node('option',label,{value}));
 const controls=node('div',undefined,{class:'grid two'});controls.append(nameLabel,addLabel);
 const filters=node('div',undefined,{class:'actions'});filters.append(search,filter);
 const facts=node('p',undefined,{class:'small muted','aria-live':'polite'}),tableWrap=node('div',undefined,{class:'table-wrap'}),table=node('table'),head=node('thead'),header=node('tr'),body=node('tbody');
 for(const label of ['Original file','Interpretation','Retained source sections','Inclusion and note',''])header.append(node('th',label));
 head.append(header);table.append(head,body);tableWrap.append(table);
 const pager=node('div',undefined,{class:'actions'}),before=button('Previous originals',()=>{page=Math.max(0,page-1);render();}),after=button('Next originals',()=>{page++;render();}),position=node('span');
 pager.append(before,position,after);section.append(title,help,toolbar,controls,filters,facts,tableWrap,pager);root.replaceChildren(section);
 let index={activeId:null,collections:[]},active=null,working=null,page=0,loading=false,pending=null,writer=null,lastError=null;
 function perform(work){return run(async()=>{if(loading)throw new Error('Wait for the current collection operation to complete.');setLoading(true);try{return await work();}finally{setLoading(false);render();}});}
 const requireActive=()=>{if(!active)throw new Error('Create or open an original statement collection.');};
 function enqueue(value){pending=value;if(!writer)writer=drain();return writer;}
 async function drain(){
  try{while(pending){const selected=pending;pending=null;const next={...index,activeId:selected.id,collections:index.collections.filter(row=>row.id!==selected.id).concat({id:selected.id,name:selected.name,revision:selected.revision,count:selected.items.length})};
    try{await saveCollection(selected,next);index=next;lastError=null;}catch(error){pending=pending||selected;lastError=error;notice('The working collection is still available in this page. Saving needs attention: '+error.message,'error');break;}}}
  finally{writer=null;}
 }
 async function flush(){if(!writer&&pending)writer=drain();if(writer)await writer;if(lastError)throw lastError;}
 function commit(value){active=value;enqueue(value);}
 function setLoading(value){loading=value;for(const n of [select,create,receive,exportButton,name,add,search,filter])n.disabled=value;for(const n of root.querySelectorAll('button,input,select,textarea'))if(n!==before&&n!==after)n.disabled=value;before.disabled=value||page===0;after.disabled=value||after.dataset.last==='true';}
 function render(){
  select.replaceChildren();for(const row of index.collections)select.append(node('option',row.name+' · '+row.count+' files',{value:row.id}));
  if(active&&!index.collections.some(row=>row.id===active.id))select.append(node('option',active.name,{value:active.id}));
  select.value=active?.id||'';name.value=active?.name||'';exportButton.disabled=!active||loading;add.disabled=!active||loading;name.disabled=!active||loading;
  body.replaceChildren();
  if(!active){facts.textContent='Create a collection or open a complete downloaded collection.';position.textContent='';before.disabled=true;after.disabled=true;return;}
  const progress=collectionProgress(active,getImports()),byId=new Map(progress.map(row=>[row.id,row]));
  const term=search.value.trim().toLowerCase(),matching=active.items.filter(item=>{
   const p=byId.get(item.id);return (!filter.value||p.status===filter.value)&&(!term||[item.file.name,item.note,item.mapping.format,...p.sections.flatMap(s=>[s.accountId,s.currency,s.from,s.until])].join(' ').toLowerCase().includes(term));});
  page=Math.min(page,Math.max(0,Math.ceil(matching.length/25)-1));
  const shown=matching.slice(page*25,page*25+25),bytes=active.items.reduce((n,item)=>n+item.file.bytes,0);
  facts.textContent=active.items.length+' original files · '+bytes.toLocaleString()+' bytes · '+progress.filter(p=>p.status==='RETAINED').length+' completely retained · revision '+active.revision+(lastError?' · save needs attention':'');
  for(const item of shown){
   const p=byId.get(item.id),tr=node('tr'),file=node('td'),interpretation=node('td'),status=node('td'),decision=node('td'),actions=node('td');
   file.append(node('strong',item.file.name),node('p',item.file.bytes.toLocaleString()+' bytes',{class:'small'}),node('code',item.file.sha256,{class:'small'}));
   interpretation.append(node('p',item.mapping.format),node('p',item.mapping.accountNamespace||'Original institution identity',{class:'small'}));
   status.append(node('p',p.status.toLowerCase().replaceAll('_',' ')),node('p',p.completed+' / '+p.total+' current sections retained',{class:'small'}));
   if(!p.total&&p.existingImports)status.append(node('p',p.existingImports+' imports have these original bytes; prepare the current interpretation to identify all sections.',{class:'small muted'}));
   for(const s of p.sections){const text=s.accountId+' · '+s.currency+' · '+(s.from||'unspecified')+' – '+(s.until||'unspecified')+' · '+s.postedCount+' rows · '+s.activeImports.length+' current / '+s.imports.length+' retained imports';const label=node('p',text,{class:'small'});status.append(label);}
   const inclusion=node('input',undefined,{type:'checkbox','aria-label':'Include '+item.file.name});inclusion.checked=item.included;
   const label=node('label','Include in intake',{class:'check-line'});label.prepend(inclusion);
   const note=node('textarea',undefined,{maxlength:4000,'aria-label':'Original file note for '+item.file.name,placeholder:'Reason for exclusion or source review note'});note.value=item.note;
   inclusion.addEventListener('change',()=>{commit(updateItem(active,item.id,{included:inclusion.checked}));render();});
   note.addEventListener('input',()=>commit(updateItem(active,item.id,{note:note.value})));
   note.addEventListener('change',()=>render());
   decision.append(label,note);
   const open=button('Review original',async()=>{await flush();working={collectionId:active.id,itemId:item.id};await openItem(active.items.find(row=>row.id===item.id));});
   open.disabled=!item.included||loading;
   const original=button('Download original',()=>download(item.file.name,new Blob([decodeBytes(item.file.dataBase64)],{type:'application/octet-stream'})));
   actions.append(open,original);tr.append(file,interpretation,status,decision,actions);body.append(tr);
  }
  if(!shown.length){const tr=node('tr'),td=node('td',active.items.length?'No originals match these filters.':'Add the complete original files to begin.',{colspan:5,class:'empty'});tr.append(td);body.append(tr);}
  position.textContent=matching.length?'Originals '+(page*25+1)+'–'+(page*25+shown.length)+' of '+matching.length:'No matching originals';
  before.disabled=loading||page===0;after.dataset.last=String((page+1)*25>=matching.length);after.disabled=loading||after.dataset.last==='true';
 }
 async function newCollection(){await flush();working=null;active=createCollection({id:uuid(),workspaceId,name:'Original bank statements'});commit(active);await flush();page=0;render();}
 select.addEventListener('change',()=>perform(async()=>{await flush();working=null;const value=await readCollection(select.value);if(!value||value.workspaceId!==workspaceId)throw new Error('This collection belongs to another workspace. Receive its complete download as a new copy.');active=value;index.activeId=value.id;await saveCollection(value,index);page=0;render();}));
 name.addEventListener('input',()=>{if(active)commit(renameCollection(active,name.value));});
 name.addEventListener('change',()=>render());
 search.addEventListener('input',()=>{page=0;render();});filter.addEventListener('change',()=>{page=0;render();});
 add.addEventListener('change',()=>perform(async()=>{
  const chosen=[...add.files];if(!chosen.length)return;requireActive();setLoading(true);
  try{await flush();if(active.items.length+chosen.length>COLLECTION_LIMITS.files||active.items.reduce((n,row)=>n+row.file.bytes,0)+chosen.reduce((n,file)=>n+file.size,0)>COLLECTION_LIMITS.totalBytes)throw new Error('Select up to 1,000 files and 128 MB of original bytes per collection.');
   const files=[];for(const file of chosen){if(!file.size||file.size>COLLECTION_LIMITS.fileBytes)throw new Error(file.name+' must contain 1–16,000,000 original bytes.');
    const extension=file.name.toLowerCase().split('.').at(-1),d=defaultMapping();d.format=extension==='qfx'?'QFX':['csv','tsv'].includes(extension)?'CSV':extension==='ofx'?'OFX':extension==='xml'?'CAMT053':d.format;if(extension==='tsv')d.delimiter='\t';
    files.push({id:uuid(),file:{name:file.name,dataBase64:encodeBytes(new Uint8Array(await file.arrayBuffer()))},mapping:d});
   }
   commit(await appendFiles(active,files));await flush();notice('Added '+files.length+' complete originals. Review their individual source interpretations.');page=0;
  }finally{add.value='';setLoading(false);render();}
 }));
 receive.addEventListener('change',()=>perform(async()=>{
  const file=receive.files?.[0];if(!file)return;setLoading(true);
  try{await flush();if(file.size>COLLECTION_LIMITS.transferBytes)throw new Error('The complete collection JSON exceeds 192 MB.');const parsed=JSON.parse(await file.text());
   const selected=await receiveCollection(parsed,{workspaceId,id:uuid()});working=null;commit(selected);await flush();page=0;notice('Opened every original file and working interpretation as a separate collection. Prepare current source reviews before retaining any statement.');
  }finally{receive.value='';setLoading(false);render();}
 }));
 async function open(){await flush();render();}
 async function init(){const saved=await readIndex();if(saved&&Array.isArray(saved.collections)){index=saved;const chosen=index.activeId||index.collections.at(-1)?.id;if(chosen){active=await readCollection(chosen);if(active?.workspaceId!==workspaceId)throw new Error('The saved original-file collection belongs to another workspace.');}}render();}
 function mappingChanged(file,mapping){if(!working||active?.id!==working.collectionId)return;const item=active.items.find(row=>row.id===working.itemId);if(!item||item.file.sha256!==file?.sha256||item.file.name!==file.name){working=null;return;}if(mappingSignature(item.mapping)!==mappingSignature(mapping))commit(updateItem(active,item.id,{mapping}));}
 async function previewed(file,mapping,preview){mappingChanged(file,mapping);if(!working||active?.id!==working.collectionId)return;commit(retainPreview(active,working.itemId,preview,mapping));await flush();}
 return {init,open,render,flush,mappingChanged,previewed,detach:()=>{working=null;},workingLabel:()=>working&&active?.id===working.collectionId?active.name:null};
}
