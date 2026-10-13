/* MIT. Complete offline Event mapping editor. Original parser/model own all comparisons. */
export function mountEventMappingWorking(root,{api,initial,view={},onChange,onMessage}={}){
 if(!root||!api)throw Error('Provide the original mapping root and source-bound runtime.');
 const doc=root.ownerDocument,win=doc.defaultView,MAX=192*1024*1024;
 let working=api.reopen(initial),draft=clone(working.draft),dirty=false,generation=0,busy=false,opened=null,displaced=[],catalogueCache=new Map();
 const initialWorking=working;
 let selectedSide=['previous','current','added'].includes(view.side)?view.side:'current';
 let filter=typeof view.filter==='string'?view.filter.slice(0,2000):'',page=Number.isSafeInteger(view.page)&&view.page>=0?view.page:0;
 let selectedPointer=typeof view.pointer==='string'?view.pointer:'',valueOffset=Number.isSafeInteger(view.offset)&&view.offset>=0?view.offset:0;
 const el=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n;};
 const own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
 function clone(v){return JSON.parse(JSON.stringify(v));}
 const pretty=v=>JSON.stringify(v,null,2),bytes=s=>new win.TextEncoder().encode(s).length;
 const stable=v=>Array.isArray(v)?'['+v.map(stable).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable(v[k])).join(',')+'}':JSON.stringify(v);
 function button(text,fn){const b=el('button',text);b.type='button';b.addEventListener('click',()=>guard(fn));return b;}
 function message(text,error=false){status.textContent=text;status.dataset.error=error?'true':'false';if(onMessage)onMessage(text,{error});}
 function guard(fn){try{const r=fn();if(r&&typeof r.then==='function')r.catch(e=>message(e.message,true));}catch(e){message(e.message,true);}}
 function touch(){dirty=true;generation++;opened=null;importPanel.replaceChildren();changeIndicator.textContent='Changed work is held in this window. Request a complete JSON or editable HTML download before closing.';}
 function current(){return api.updateDraft(working,draft);}
 function changed(next){working=api.reopen(next);draft=clone(working.draft);touch();if(onChange)onChange(working);return working;}
 function textField(label,value,max,apply,multi=false){const labelNode=el('label',label),input=el(multi?'textarea':'input');if(!multi)input.type='text';input.value=value;input.maxLength=max;if(multi)input.rows=3;input.addEventListener('input',()=>{apply(input.value);touch();status.textContent='Unfinished edits are retained in this window. Compare changed field choices before recording a final review; full working downloads preserve these edits.';status.dataset.error='false';const note=comparisonPanel.querySelector('[data-comparison-note]');if(note)note.textContent='Choices or review text have been edited. Use Compare current choices to refresh the source comparison, or download the complete unfinished working copy.';});labelNode.append(input);return labelNode;}
 function raw(parent,label,value){const d=el('details'),s=el('summary',label);d.append(s);let loaded=false;d.addEventListener('toggle',()=>{if(d.open&&!loaded){d.append(el('pre',typeof value==='string'?value:pretty(value)));loaded=true;}});parent.append(d);return d;}
 function download(name,text,type='application/json;charset=utf-8'){
  if(bytes(text)>MAX)throw Error('The complete download exceeds 192 MiB. Keep this open window and its original files; no content was omitted.');
  const url=win.URL.createObjectURL(new win.Blob([text],{type})),a=el('a');a.href=url;a.download=name;doc.body.append(a);a.click();a.remove();win.setTimeout(()=>win.URL.revokeObjectURL(url),30000);
  message('Requested '+name+'. Verify the saved file before closing; this window retains its changed-work reminder.');
 }
 function saveWorking(){const w=current();download('event-mapping-working.json',api.serialize(w));}
 function getView(){return{side:selectedSide,filter,page,pointer:selectedPointer,offset:valueOffset};}
 function saveHTML(){
  const w=current(),data=doc.getElementById('event-mapping-working-data');
  if(!data||root.id!=='event-mapping-working-root')throw Error('Use the installed complete HTML composer to save this editor.');
  const tree=doc.documentElement.cloneNode(true),r=tree.querySelector('#event-mapping-working-root');
  r.replaceChildren();tree.querySelector('#event-mapping-working-data').textContent=JSON.stringify({working:w,view:getView()}).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  const bootError=tree.querySelector('#event-mapping-boot-error');if(bootError)bootError.textContent='';
  download('event-mapping-working.html','<!doctype html>\n'+tree.outerHTML,'text/html;charset=utf-8');
 }
 function binding(w){return stable({comparison:w.original.comparison,files:Object.fromEntries(Object.entries(w.original.files).map(([side,files])=>[side,Object.fromEntries(Object.entries(files).map(([kind,f])=>[kind,{name:f.name,bytes:f.bytes,sha256:f.sha256}]))]))});}
 const originalBinding=binding(working),cacheKey='stellar-forge.mapping-working.v1:'+working.original.comparison.workspace_id+':'+working.original.comparison.programme+':'+working.original.comparison.input_id+':'+working.original.comparison.comparison_sha256;
 function checkIncoming(value){const w=api.reopen(value);if(binding(w)!==originalBinding)throw Error('This file belongs to a different original source pair or native context. Open its own complete editor.');return w;}
 function offerIncoming(w,label){
  opened={working:w,label,generation};importPanel.replaceChildren(el('h3','Inspected working copy'),el('p',label),el('p','Original source and native context match. Current field choices and review history will be replaced only if you choose Open inspected copy. Download the current working copy first if you want an independent saved edition.'));
  const facts=el('dl');pair(facts,'Current saved comparisons',working.history.length);pair(facts,'Incoming saved comparisons',w.history.length);pair(facts,'Incoming reviewer',w.draft.reviewer||'Unfinished');importPanel.append(facts);
  const bar=el('div',undefined,'emw-toolbar');bar.append(button('Download current complete work',saveWorking),button('Download inspected copy',()=>download('inspected-event-mapping-working.json',api.serialize(w))),button('Open inspected copy',()=>{
   if(!opened||opened.working!==w||opened.generation!==generation)throw Error('Current work changed after inspection. Inspect the file again.');
   displaced.push(current());working=w;draft=clone(w.draft);opened=null;touch();renderAll();message('Opened the inspected copy. Every displaced complete edition remains separately downloadable in this window. Save those files before closing; the current JSON/HTML contains the selected working edition.');if(onChange)onChange(working);
  }));importPanel.append(bar);
 }
 async function inspectFile(file){
  if(!file)return;if(file.size>MAX)throw Error('Select the complete working JSON within 192 MiB.');
  const start=generation,base=working;busy=true;fileInput.disabled=true;
  try{const text=await file.text();if(start!==generation||base!==working)throw Error('Current work changed while the file was read. Inspect it again.');if(bytes(text)>MAX)throw Error('The complete file exceeds 192 MiB.');const value=JSON.parse(text),w=checkIncoming(value);if(start!==generation||base!==working)throw Error('Current work changed during inspection.');offerIncoming(w,'Selected file: '+file.name);}
  finally{busy=false;fileInput.disabled=false;fileInput.value='';}
 }
 function cacheSave(){const text=api.serialize(current());try{win.localStorage.setItem(cacheKey,text);}catch(e){throw Error('The browser could not retain the complete copy. Download JSON or HTML now. '+e.message);}message('Saved a complete browser checkpoint for this exact source pair. Restore remains an explicit choice.');}
 function cacheInspect(){let text;try{text=win.localStorage.getItem(cacheKey);}catch(e){throw Error('Browser checkpoint unavailable: '+e.message);}if(text===null)throw Error('No browser checkpoint is retained for this source pair.');if(bytes(text)>MAX)throw Error('Retained checkpoint exceeds the full working allowance.');offerIncoming(checkIncoming(JSON.parse(text)),'Browser checkpoint for the same original pair');}
 function pair(dl,name,value){dl.append(el('dt',name),el('dd',typeof value==='string'?value:pretty(value)));}
 const heading=el('h1','Event mapping working copy'),intro=el('p','Review the accepted and current event windows, edit complete field choices, and return the full review to the original Analysis operator.');
 const status=el('p',undefined,'emw-status');status.setAttribute('role','status');
 const changeIndicator=el('p','The embedded complete edition is available under Files. Browser checkpoints are restored only when you choose them.','emw-note');
 const toolbar=el('div',undefined,'emw-toolbar');
 toolbar.append(button('Download complete working JSON',saveWorking),button('Download editable HTML',saveHTML),button('Download native review',()=>{const w=current(),s=api.status(w);download('event-mapping-working-review.json',JSON.stringify(api.nativeReview(w))+'\n');message('Requested the full native review'+(s.ready?'':'; it retains unfinished choices')+'. The original service will recompute against its own current source.');}),button('Save browser checkpoint',cacheSave),button('Inspect browser checkpoint',cacheInspect));
 const importLabel=el('label','Inspect a complete working JSON'),fileInput=el('input');fileInput.type='file';fileInput.accept='.json,application/json';fileInput.addEventListener('change',()=>guard(()=>inspectFile(fileInput.files[0])));importLabel.append(fileInput);
 const importPanel=el('section',undefined,'emw-panel'),identityPanel=el('section',undefined,'emw-panel'),fieldsPanel=el('section',undefined,'emw-panel'),comparisonPanel=el('section',undefined,'emw-panel'),populationPanel=el('section',undefined,'emw-panel'),historyPanel=el('section',undefined,'emw-panel'),filesPanel=el('section',undefined,'emw-panel');
 root.replaceChildren(heading,intro,status,changeIndicator,toolbar,importLabel,importPanel,identityPanel,fieldsPanel,comparisonPanel,populationPanel,historyPanel,filesPanel);
 function renderStatus(){try{const s=api.status(current());status.textContent=s.ready?'Current comparison is complete and all required review reasons are recorded.':s.errors.join(' ');status.dataset.error='false';}catch(e){status.textContent=e.message;status.dataset.error='true';}}
 function renderIdentity(){
  identityPanel.replaceChildren(el('h2','Original source and native destination'));const c=working.original.comparison,dl=el('dl');
  for(const [name,value]of [['Workspace',c.workspace_id],['Programme',c.programme],['Accepted programme revision',c.programme_revision],['Received input',c.input_id],['Accepted operation',c.baseline_operation_id],['Original comparison SHA-256',c.comparison_sha256],['Parser SHA-256',c.receiver.core_sha256]])pair(dl,name,value);
  identityPanel.append(dl);raw(identityPanel,'Complete original comparison and source-window identity',c);
 }
 function renderFields(){
  fieldsPanel.replaceChildren(el('h2','Field choices'),el('p','Keep the exact output name and JSON pointer for every selected field. An empty pointer selects the payload root. Unfinished choices remain in complete working downloads.'));
  const list=el('div');
  draft.fields.forEach((field,index)=>{
   const row=el('fieldset'),legend=el('legend','Field '+(index+1));row.append(legend);
   const inputs=el('div',undefined,'emw-grid');inputs.append(textField('Output name',field.name,48,v=>{field.name=v;}),textField('Original JSON pointer',field.pointer,2000,v=>{field.pointer=v;}));row.append(inputs);
   const bar=el('div',undefined,'emw-toolbar');const up=button('Move up',()=>{[draft.fields[index-1],draft.fields[index]]=[draft.fields[index],draft.fields[index-1]];touch();renderFields();renderStatus();});up.disabled=index===0;
   const down=button('Move down',()=>{[draft.fields[index+1],draft.fields[index]]=[draft.fields[index],draft.fields[index+1]];touch();renderFields();renderStatus();});down.disabled=index===draft.fields.length-1;
   bar.append(up,down,button('Remove field',()=>{draft.fields.splice(index,1);touch();renderFields();renderStatus();}),button('Inspect source values',()=>{selectedPointer=field.pointer;valueOffset=0;renderPopulation();populationPanel.scrollIntoView({block:'start'});}));row.append(bar);list.append(row);
  });fieldsPanel.append(list);
  const add=button('Add unfinished field',()=>{if(draft.fields.length>=100)throw Error('The original mapping permits 100 fields.');draft.fields.push({name:'',pointer:''});touch();renderFields();renderStatus();});add.disabled=draft.fields.length>=100;
  const compare=button('Compare current choices',()=>{const before=current(),next=api.compare(before),advanced=next!==before;changed(next);renderAll();message(advanced?'Saved the earlier complete comparison and draft; record new reasons for this changed comparison.':'The selected fields match the saved comparison. Existing reasons remain.');});
  fieldsPanel.append(add,compare,textField('Reviewer',draft.reviewer,240,v=>{draft.reviewer=v;}),textField('Complete review note',draft.note,8000,v=>{draft.note=v;},true));
 }
 function coverage(c){if(!c)return'No mapped path';return c.present+' present / '+c.missing+' missing / '+c.events+' events; '+Object.entries(c.types).filter(([,n])=>n).map(([k,n])=>k+': '+n).join(', ');}
 function renderComparison(){
  comparisonPanel.replaceChildren(el('h2','Saved comparison and explicit decisions'));
  const s=api.status(current());const comparisonNote=el('p',s.current?'These results describe the current field choices.':'Field choices have changed or remain unfinished. These results describe the last saved comparison; run Compare current choices before reviewing them.');comparisonNote.setAttribute('data-comparison-note','');comparisonPanel.append(comparisonNote);
  const c=working.comparison,dl=el('dl');pair(dl,'Comparison SHA-256',c.comparison_sha256);pair(dl,'New-event window',c.window);comparisonPanel.append(dl);
  const table=el('table'),head=el('tr');['Output','Change','Previous pointer','Current pointer','Previous population','Current population','New events','Review reasons'].forEach(t=>head.append(el('th',t)));const thead=el('thead');thead.append(head);table.append(thead);const body=el('tbody');
  for(const row of c.mapped_fields){const tr=el('tr');[row.name,row.change,row.before_pointer===null?'Removed or absent':row.before_pointer||'(root)',row.after_pointer===null?'Removed or absent':row.after_pointer||'(root)',coverage(row.selected_path?.before),coverage(row.selected_path?.after),coverage(row.selected_path?.added),row.review_reasons.join(', ')||'No required reason'].forEach(v=>tr.append(el('td',v)));body.append(tr);}
  table.append(body);const scroll=el('div',undefined,'emw-scroll');scroll.append(table);comparisonPanel.append(scroll);
  for(const name of c.required_decisions)comparisonPanel.append(textField('Reason for '+name,own(draft.decisions,name)?draft.decisions[name]:'',4000,v=>{Object.defineProperty(draft.decisions,name,{value:v,writable:true,configurable:true,enumerable:true});},true));
  const extra=Object.keys(draft.decisions).filter(name=>!c.required_decisions.includes(name));
  if(extra.length){const d=el('details');d.append(el('summary','Retained other decision notes ('+extra.length+')'));for(const name of extra){d.append(textField('Retained reason: '+name,draft.decisions[name],4000,v=>{draft.decisions[name]=v;},true),button('Remove retained reason '+name,()=>{delete draft.decisions[name];touch();renderComparison();renderStatus();}));}comparisonPanel.append(d);}
  raw(comparisonPanel,'Complete saved comparison',c);
 }
 function catalogue(){if(!catalogueCache.has(selectedSide))catalogueCache.set(selectedSide,api.catalogue(working,selectedSide));return catalogueCache.get(selectedSide);}
 function renderPopulation(){
  populationPanel.replaceChildren(el('h2','Original field populations'),el('p','Each count and value is read by the original parser from the retained full source files. New events are only those after the accepted checkpoint.'));
  const controls=el('div',undefined,'emw-grid'),sideLabel=el('label','Population'),side=el('select');for(const [value,label]of [['previous','Accepted window'],['current','Current cumulative window'],['added','New events only']]){const o=el('option',label);o.value=value;side.append(o);}side.value=selectedSide;side.addEventListener('change',()=>{selectedSide=side.value;page=0;valueOffset=0;renderPopulation();});sideLabel.append(side);
  const filterLabel=el('label','Filter original pointers'),filterInput=el('input');filterInput.type='search';filterInput.value=filter;filterInput.maxLength=2000;filterInput.addEventListener('input',()=>{filter=filterInput.value;page=0;renderCatalogue();});filterLabel.append(filterInput);controls.append(sideLabel,filterLabel);populationPanel.append(controls);
  const catalogueRoot=el('div'),valuesRoot=el('div');populationPanel.append(catalogueRoot,valuesRoot);
  function renderCatalogue(){
   catalogueRoot.replaceChildren();let cat;try{cat=catalogue();}catch(e){catalogueRoot.append(el('p',e.message));return;}
   const rows=cat.fields.filter(r=>r.pointer.toLowerCase().includes(filter.toLowerCase())),pages=Math.max(1,Math.ceil(rows.length/40));page=Math.min(page,pages-1);
   catalogueRoot.append(el('p',rows.length+' matching paths of '+cat.field_count+'. Page '+(page+1)+' of '+pages+'. All source paths remain in the original files.'));
   const table=el('table'),thead=el('thead'),tr=el('tr');['Pointer','Present','Missing','Observed JSON kinds','Original values'].forEach(t=>tr.append(el('th',t)));thead.append(tr);table.append(thead);const body=el('tbody');
   for(const row of rows.slice(page*40,(page+1)*40)){const r=el('tr');r.append(el('td',row.pointer||'(root)'),el('td',row.present),el('td',row.missing),el('td',Object.entries(row.types).filter(([,n])=>n).map(([k,n])=>k+': '+n).join(', ')));const td=el('td');const b=button('Inspect full values',()=>{selectedPointer=row.pointer;valueOffset=0;renderValues();});b.disabled=!row.selectable;td.append(b);r.append(td);body.append(r);}table.append(body);const scroll=el('div',undefined,'emw-scroll');scroll.append(table);catalogueRoot.append(scroll);
   const bar=el('div',undefined,'emw-toolbar'),back=button('Previous path page',()=>{page--;renderCatalogue();}),next=button('Next path page',()=>{page++;renderCatalogue();});back.disabled=page===0;next.disabled=page+1>=pages;bar.append(back,next,button('Download complete population catalogue',()=>download('event-fields-'+selectedSide+'.json',pretty(cat)+'\n')));catalogueRoot.append(bar);
  }
  function renderValues(){
   valuesRoot.replaceChildren(el('h3','Complete values for one original pointer'));const resultBody=el('div'),pendingNote=el('p');const label=el('label','JSON pointer'),input=el('input');input.type='text';input.maxLength=2000;input.value=selectedPointer;input.addEventListener('input',()=>{selectedPointer=input.value;valueOffset=0;resultBody.hidden=true;pendingNote.textContent='This pointer is unfinished. Choose Read original values to load its exact original events.';});label.append(input);valuesRoot.append(label,button('Read original values',()=>{selectedPointer=input.value;valueOffset=0;renderValues();}),pendingNote,resultBody);
   let values;try{values=api.values(working,selectedSide,selectedPointer,{offset:valueOffset,limit:10});}catch(e){resultBody.append(el('p',e.message));return;}
   resultBody.append(el('p','Returned pointer: '+(values.pointer||'(payload root)')),el('p','Original event offset '+values.offset+'; '+values.rows.length+' shown of '+values.total+'. Missing and null remain distinct.'));
   for(const row of values.rows){const box=el('details'),s=el('summary','Event '+row.index+' · '+row.state);box.append(s);let loaded=false;box.addEventListener('toggle',()=>{if(box.open&&!loaded){box.append(el('pre',pretty(row.event)),el('p','Value bytes: '+(row.value_bytes===null?'Not a retained scalar/text value':row.value_bytes)),el('p','SHA-256: '+(row.value_sha256||'Not applicable')),el('pre',row.text===null?(row.state==='missing'?'This original event has no value at this pointer.':'JSON null'):row.text));loaded=true;}});resultBody.append(box);}
   const bar=el('div',undefined,'emw-toolbar'),prev=button('Previous event page',()=>{valueOffset=Math.max(0,valueOffset-10);renderValues();}),next=button('Next event page',()=>{valueOffset=values.next_offset;renderValues();});prev.disabled=valueOffset===0;next.disabled=values.next_offset===null;bar.append(prev,next,button('Download complete value page',()=>download('event-values-'+selectedSide+'-'+values.offset+'.json',pretty(values)+'\n')),button('Add pointer as unfinished field',()=>{if(draft.fields.length>=100)throw Error('The original mapping permits 100 fields.');draft.fields.push({name:'',pointer:selectedPointer});touch();renderFields();renderStatus();fieldsPanel.scrollIntoView({block:'start'});}));resultBody.append(bar);
  }
  renderCatalogue();renderValues();
 }
 function renderHistory(){historyPanel.replaceChildren(el('h2','Complete comparison history'),el('p',working.history.length+' earlier comparison and draft editions retained. Earlier reasons remain with the exact comparison they reviewed.'));
  working.history.forEach((item,index)=>{const d=raw(historyPanel,'Earlier comparison '+(index+1)+' · '+item.comparison.comparison_sha256,item);d.append(button('Download complete earlier comparison '+(index+1),()=>download('mapping-comparison-'+(index+1)+'.json',pretty(item)+'\n')));});
 }
 function renderFiles(){filesPanel.replaceChildren(el('h2','Complete original files and retained editions'));
  for(const f of api.files(working)){const box=el('div',undefined,'emw-file');box.append(el('h3',f.side+' / '+f.kind),el('p',f.name+' · '+f.bytes+' bytes'),el('p','SHA-256 '+f.sha256),button('Download exact '+f.side+' '+f.kind,()=>download(f.name,f.text,f.kind==='ndjson'?'application/x-ndjson;charset=utf-8':'application/json;charset=utf-8')));raw(box,'Read complete original '+f.name,f.text);filesPanel.append(box);}
  filesPanel.append(button('Download embedded starting edition',()=>download('embedded-event-mapping-working.json',api.serialize(initialWorking))));
  if(displaced.length){filesPanel.append(el('p','Displaced editions are retained separately in this open window. Download each before closing. The current working JSON and HTML contain the selected edition, including its own complete comparison history.'));displaced.forEach((copy,index)=>filesPanel.append(button('Download displaced complete working copy '+(index+1),()=>download('displaced-event-mapping-working-'+(index+1)+'.json',api.serialize(copy)))));}
 }
 function renderAll(){renderIdentity();renderFields();renderComparison();renderPopulation();renderHistory();renderFiles();renderStatus();}
 const unload=e=>{if(dirty){e.preventDefault();e.returnValue='';}};win.addEventListener('beforeunload',unload);renderAll();
 return Object.freeze({snapshot:current,view:getView,inspect:checkIncoming,get changed(){return dirty;},destroy(){win.removeEventListener('beforeunload',unload);root.replaceChildren();}});
}
