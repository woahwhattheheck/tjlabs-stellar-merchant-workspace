/* MIT. Complete source-bound colleague review controls; original model owns decisions. */
export function mountEventMappingReview(root,{api,getCurrent,setCurrent,download,saveEditable,onMessage}={}){
 if(!root||!api||!getCurrent||!setCurrent||!download||!saveEditable)throw Error('Provide the complete original colleague review controls.');
 const doc=root.ownerDocument,win=doc.defaultView,MAX=192*1024*1024;
 let destroyed=false,inspected=null,busy=false,previewRoot;
 const el=(tag,text)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=String(text);return n;};
 const pretty=x=>JSON.stringify(x,null,2)+'\n';
 const message=(text,error=false)=>{if(onMessage)onMessage(text,{error});};
 const current=()=>api.reopen(getCurrent());
 function guard(fn){try{const result=fn();if(result&&typeof result.then==='function')result.catch(e=>message(e.message,true));}catch(e){message(e.message,true);}}
 function button(text,fn){const b=el('button',text);b.type='button';b.addEventListener('click',()=>guard(fn));return b;}
 function commit(value,refresh=true){setCurrent(api.reopen(value),{refresh:false});if(refresh)render();}
 function raw(parent,label,value){const box=el('details');box.append(el('summary',label));let read=false;box.addEventListener('toggle',()=>{if(box.open&&!read){box.append(el('pre',pretty(value)));read=true;}});parent.append(box);return box;}
 function toolbar(...buttons){const bar=el('div');bar.className='emw-toolbar';bar.append(...buttons);return bar;}
 function pendingField(parent,label,key,max=16000,multi=false,receive=false){
  const labelNode=el('label',label),input=el(multi?'textarea':'input');if(!multi)input.type='text';input.value=current().review_receiving.pending[key]||'';input.maxLength=max;if(multi)input.rows=3;
  input.addEventListener('input',()=>{const previous=current().review_receiving.pending[key]||'';try{const next=api.updatePending(current(),{[key]:input.value});commit(next,false);if(receive)renderPreview();}catch(error){input.value=previous;message('This change was not applied; the complete retained form is unchanged. '+error.message,true);}});
  labelNode.append(input);parent.append(labelNode);return input;
 }
 function timeField(parent,key,receive=false){
  const input=pendingField(parent,'Original UTC time (YYYY-MM-DDTHH:mm:ss.sssZ)',key,32,false,receive);
  parent.append(button('Record current UTC time',()=>{const stamp=new Date().toISOString();commit(api.updatePending(current(),{[key]:stamp}),false);input.value=stamp;if(receive)renderPreview();message('Recorded '+stamp+' in the complete pending form. Repeated preparation uses this same recorded time.');}));
 }
 function activeReturn(value){const e=value.review_receiving,locals=e.incoming_returns.filter(r=>e.local_assignment_ids.includes(r.assignment_id));return locals.find(r=>r.id===e.selected_return_id)||locals[0]||null;}
 function renderPreview(){
  if(!previewRoot)return;previewRoot.replaceChildren();const value=current(),e=value.review_receiving,row=activeReturn(value);
  if(!row){previewRoot.append(el('p','No complete return for an assignment issued by this working copy is selected. Carried colleague returns remain available in source history below.'));return;}
  let envelope,preview;
  try{envelope=api.returnEnvelope(value,row.id);preview=api.previewReturn(value,envelope);}catch(error){previewRoot.append(el('p',error.message));return;}
  const selected=e.resolution_drafts[row.id]||{};
  previewRoot.append(el('h3','Whole source-bound receiving comparison'),el('p','Return '+row.id),el('p','Complete current digest: '+preview.current_digest),el('p',preview.already_applied?'This working copy already received this exact return. Its original receipt is retained.':'Mapping includes the whole ordered field list, its saved comparison and every reason. Reviewer and complete note are separate decisions.'));
  previewRoot.append(el('p','Earlier complete histories: baseline '+preview.retained_history.baseline+', current '+preview.retained_history.current+', returned '+preview.retained_history.returned+'.'));
  for(const item of preview.rows){
   const box=el('fieldset');box.append(el('legend',item.key+' — '+item.classification));
   const grid=el('div');grid.className='emr-comparison-grid';
   for(const [label,key]of [['Issued baseline','baseline'],['Current producer work','current'],['Returned colleague work','returned']]){
    const column=el('div');column.append(el('h4',label));
    if(item.key==='mapping'){const map=item[key];column.append(el('p',map.fields.length+' ordered fields · '+Object.keys(map.decisions).length+' retained reasons'),el('p','Comparison '+map.comparison.comparison_sha256));raw(column,'Complete ordered fields',map.fields);raw(column,'All exact reason text',map.decisions);raw(column,'Complete comparison',map.comparison);}
    else column.append(el('pre',item[key]));
    grid.append(column);
   }box.append(grid);
   if(['incoming','same','conflict'].includes(item.classification)){
    const label=el('label','Receiving choice'),select=el('select');
    for(const [v,t]of [['',item.classification==='conflict'?'Choose explicitly before applying':'Use the model default'],['keep-current','Keep complete current '+item.key],['use-returned','Use complete returned '+item.key]]){const opt=el('option',t);opt.value=v;select.append(opt);}select.value=selected[item.key]||'';
    select.disabled=preview.already_applied;select.addEventListener('change',()=>guard(()=>{commit(api.setResolutionDraft(current(),row.id,item.key,select.value||null),false);renderPreview();}));label.append(select);box.append(label);
   }else if(Object.prototype.hasOwnProperty.call(selected,item.key)){
    box.append(el('p','A previous choice is stale because this unit no longer has an incoming change.'),button('Clear retained '+item.key+' choice',()=>{commit(api.setResolutionDraft(current(),row.id,item.key,null),false);renderPreview();}));
   }
   previewRoot.append(box);
  }
  const apply=button('Receive the reviewed complete return',()=>{
   const now=current(),p=now.review_receiving.pending,request={resolutions:now.review_receiving.resolution_drafts[row.id]||{},actor:p.receive_actor||'',note:p.receive_note||'',at:p.receive_at||'',expected_current_digest:preview.current_digest};
   const next=api.applyReturn(now,envelope,request);commit(next);message('Received this exact colleague return into the current working copy. Complete original/current/returned histories and its receipt remain in the whole JSON/HTML. Continue the original native Review from these selected fields.');
  });apply.disabled=preview.already_applied;
  previewRoot.append(toolbar(button('Download complete displayed comparison',()=>download('event-mapping-colleague-preview.json',pretty(preview))),apply));
  if(preview.carried_receipt_ids.length)raw(previewRoot,'Retained other-operator receipt identities',preview.carried_receipt_ids);
 }
 async function inspectReturn(file){
  if(!file)return;if(file.size>MAX)throw Error('Select the entire colleague return within 192 MiB.');
  const before=api.inspect(current()).working_digest;busy=true;render();
  try{
   const rawBytes=await file.arrayBuffer();if(destroyed)throw Error('This review panel was closed during the file read.');
   const text=new win.TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(rawBytes);
   if(new win.TextEncoder().encode(text).length!==rawBytes.byteLength)throw Error('Keep the exact original UTF-8 return bytes.');
   if(api.inspect(current()).working_digest!==before)throw Error('Current work changed during the read. Inspect this complete return again.');
   const envelope=JSON.parse(text),preview=api.previewReturn(current(),envelope);
   inspected={text,name:file.name,envelope,digest:before,preview};message('Inspected the complete return against this original issued source. Choose Retain inspected return to add its full source before receiving.');
  }finally{busy=false;if(!destroyed)render();}
 }
 function render(){
  if(destroyed)return;const value=current(),e=value.review_receiving;
  root.replaceChildren(el('h2','Colleague assignment and complete return'),el('p','Issue the whole original event pair and unfinished mapping, then review the returned complete work against your issued baseline and current choices. Source histories stay separate from this working copy’s issuing and receiving authority.'));
  const issue=el('details');issue.append(el('summary','Issue a complete mapping assignment'));
  pendingField(issue,'Issuing engineer','issuer',240);pendingField(issue,'Reviewing colleague','recipient',240);pendingField(issue,'Complete assignment scope','assignment_note',8000,true);timeField(issue,'assignment_at');
  issue.append(button('Create complete original assignment',()=>{
   const v=current(),p=v.review_receiving.pending,next=api.createAssignment(v,{issuer:p.issuer||'',recipient:p.recipient||'',note:p.assignment_note||'',at:p.assignment_at||''});commit(next);message('Retained the issued complete baseline and original source. Download the complete assigning working file and the selected assignment for its colleague.');
  }));root.append(issue);
  const assignments=el('section');assignments.append(el('h3','Retained assignments'));
  if(!e.assignments.length)assignments.append(el('p','No assignment has been issued or received in this complete working file.'));
  for(const a of e.assignments){
   const own=e.local_assignment_ids.includes(a.id),box=el('details');box.append(el('summary',(own?'Issued here':'Retained colleague source')+' · '+a.recipient+' · '+a.at));
   box.append(el('p',a.id),el('p','Issued by '+a.issuer+' to '+a.recipient),el('pre',a.note));
   box.append(toolbar(button('Download complete assignment JSON',()=>download('event-mapping-'+a.id+'.json',pretty(api.assignmentEnvelope(current(),a.id)))),button('Download independent colleague editor',()=>saveEditable(api.openAssignment(api.assignmentEnvelope(current(),a.id)),'event-mapping-'+a.id+'.html'))));raw(box,'Complete original assignment identity and graph selection',a);assignments.append(box);
  }root.append(assignments);
  const returning=el('details');returning.append(el('summary','Prepare a complete colleague return'));
  const chosen=e.pending.return_assignment_id||e.active_assignment_id||e.assignments[0]?.id||'';
  const selectLabel=el('label','Original assignment being returned'),select=el('select');select.disabled=!e.assignments.length;
  for(const a of e.assignments){const o=el('option',a.recipient+' · '+a.at+' · '+a.id);o.value=a.id;select.append(o);}select.value=e.assignments.some(a=>a.id===chosen)?chosen:'';
  select.addEventListener('change',()=>guard(()=>commit(api.updatePending(current(),{return_assignment_id:select.value}),false)));selectLabel.append(select);returning.append(selectLabel);
  pendingField(returning,'Returning colleague','return_reviewer',240);pendingField(returning,'Complete return note','return_note',8000,true);timeField(returning,'return_at');
  const prepare=button('Retain and download complete return',()=>{const v=current(),p=v.review_receiving.pending,id=select.value;if(!id)throw Error('Select the original retained assignment.');const next=api.prepareReturn(v,id,{reviewer:p.return_reviewer||'',note:p.return_note||'',at:p.return_at||''});commit(next);download('event-mapping-'+next.review_receiving.selected_return_id+'.json',pretty(api.returnEnvelope(next,next.review_receiving.selected_return_id)));});prepare.disabled=!e.assignments.length;returning.append(prepare);root.append(returning);
  const receiving=el('section');receiving.append(el('h3','Inspect and receive a colleague return'));
  const fileLabel=el('label','Complete returned JSON'),file=el('input');file.type='file';file.accept='.json,application/json';file.disabled=busy;file.addEventListener('change',()=>guard(()=>inspectReturn(file.files[0])));fileLabel.append(file);receiving.append(fileLabel);
  if(inspected){const inspectedBox=el('fieldset');inspectedBox.append(el('legend','Inspected complete return'),el('p',inspected.name),el('p','Assignment '+inspected.preview.assignment_id),el('p','Return '+inspected.preview.return_id),el('p','Overlapping units: '+(inspected.preview.required_resolutions.join(', ')||'none')));
   inspectedBox.append(toolbar(button('Download original inspected return',()=>download(inspected.name,inspected.text)),button('Retain inspected return',()=>{const v=current();if(api.inspect(v).working_digest!==inspected.digest)throw Error('Current work changed after inspection. Inspect the original return again.');const next=api.stageReturn(v,inspected.envelope);inspected=null;commit(next);message('Retained every original returned source and history. Review the displayed whole-unit choices before receiving.');})));receiving.append(inspectedBox);}
  const local=e.incoming_returns.filter(r=>e.local_assignment_ids.includes(r.assignment_id));
  if(local.length){const label=el('label','Retained return to review'),selection=el('select'),active=activeReturn(value);for(const r of local){const o=el('option',r.reviewer+' · '+r.at+' · '+r.id);o.value=r.id;selection.append(o);}selection.value=active.id;selection.addEventListener('change',()=>guard(()=>{const v=current();commit(api.stageReturn(v,api.returnEnvelope(v,selection.value)));}));label.append(selection);receiving.append(label);}
  pendingField(receiving,'Receiving engineer','receive_actor',240,false,true);pendingField(receiving,'Complete receiving reason','receive_note',8000,true,true);timeField(receiving,'receive_at',true);
  receiving.append(button('Refresh receiving comparison',()=>renderPreview()));previewRoot=el('div');receiving.append(previewRoot);root.append(receiving);renderPreview();
  const history=el('details');history.append(el('summary','All complete colleague source and receiving history'));
  history.append(el('p',e.copies.length+' complete mapping copies; '+e.assignments.length+' assignments; '+e.incoming_returns.length+' returns; '+e.receipts.length+' receipts.'));
  for(const r of e.incoming_returns){const local=e.local_assignment_ids.includes(r.assignment_id),box=el('details');box.append(el('summary',(local?'Return for an assignment issued here':'Source-only colleague return')+' · '+r.reviewer+' · '+r.at));box.append(el('p',r.id),el('pre',r.note),button('Download this original complete return',()=>download('event-mapping-'+r.id+'.json',pretty(api.returnEnvelope(current(),r.id)))));if(!local)box.append(el('p','This working copy did not issue its assignment. Its full returned source remains retained; receiving authority stays with the original issuer.'));raw(box,'Complete return identity',r);history.append(box);}
  for(const receipt of e.receipts)raw(history,(e.local_receipt_ids.includes(receipt.id)?'Received here':'Retained other-operator receipt')+' · '+receipt.actor+' · '+receipt.at,receipt);
  for(const copy of e.copies){const box=raw(history,'Complete retained mapping copy '+copy.id,copy);box.append(button('Download this original complete mapping copy',()=>download(copy.id+'.json',pretty(copy))));}
  root.append(history);
 }
 render();return Object.freeze({refresh:render,destroy(){destroyed=true;root.replaceChildren();}});
}
