// SPDX-License-Identifier: MIT
const $=selector=>document.querySelector(selector),$$=selector=>[...document.querySelectorAll(selector)];
const key='openaq-customer:'+location.origin;
const state={identity:null,view:null,review:null,reviewEpoch:0,uiBusy:0,poll:null,refreshing:null,initial:false};
let token=new URLSearchParams(location.hash.slice(1)).get('token');
if(token){sessionStorage.setItem(key+':token',token);history.replaceState(null,'',location.pathname+location.search);}
else token=sessionStorage.getItem(key+':token');
const element=(tag,text,className)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;};
const value=x=>x===undefined||x===null?'—':typeof x==='object'?JSON.stringify(x):String(x);
const json=x=>JSON.stringify(x??null,null,2);
function notice(text,error=false){const node=$('#notice');node.hidden=!text;node.textContent=text;node.classList.toggle('error',error);}
function details(label,object){const d=element('details'),s=element('summary',label),p=element('pre',json(object));d.append(s,p);return d;}
function fields(target,rows){target.replaceChildren();const list=element('dl');for(const [key,item]of rows){list.append(element('dt',key),element('dd',value(item)));}target.append(list);}
function cards(target,rows){target.replaceChildren();for(const[label,item,detail]of rows){const card=element('div',undefined,'card');card.append(element('div',label,'label'),element('div',value(item),'value'));if(detail)card.append(element('div',detail,'detail'));target.append(card);}}
function table(target,rows,columns){
 target.replaceChildren();if(!rows?.length){target.append(element('p','No original entries are available.','empty'));return;}
 columns??=[...new Set(rows.flatMap(row=>Object.keys(row)))];
 const wrap=element('div',undefined,'table-wrap'),table=element('table'),thead=element('thead'),head=element('tr'),tbody=element('tbody');
 for(const col of columns)head.append(element('th',typeof col==='string'?col:col.label));thead.append(head);
 for(const row of rows){const tr=element('tr');for(const col of columns){
  const td=element('td');if(typeof col==='object'&&col.render){const result=col.render(row);if(result instanceof Node)td.append(result);else td.textContent=value(result);}
  else td.textContent=value(row[typeof col==='string'?col:col.key]);tr.append(td);
 }tbody.append(tr);}table.append(thead,tbody);wrap.append(table);target.append(wrap);
}
function showView(name){
 $$('[data-panel]').forEach(panel=>panel.hidden=panel.dataset.panel!==name);
 $$('[data-view]').forEach(button=>{if(button.dataset.view===name)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});
}
function pending(){try{return JSON.parse(sessionStorage.getItem(key+':pending')??'null');}catch{return null;}}
function setPending(value){if(value)sessionStorage.setItem(key+':pending',JSON.stringify(value));else sessionStorage.removeItem(key+':pending');}
function message(error){return error?.code??error?.message??'The request could not be completed.';}
async function api(path,{method='GET',body}={}){
 if(!token)throw Error('Open this console using its current private host link.');
 const response=await fetch(path,{method,headers:{authorization:'Bearer '+token,...(body===undefined?{}:{'content-type':'application/json'})},
  ...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'error'});
 if(state.identity&&response.headers.get('x-openaq-customer-instance')!==state.identity.instanceId)throw Error('The host instance changed. Reopen its current Applications link.');
 const result=await response.json();
 if(!response.ok)throw Object.assign(Error(result.error??'Request failed.'),{code:result.error,status:response.status});
 return result;
}
function controls(){
 const v=state.view,busy=state.uiBusy>0||Boolean(v?.active),acquire=v?.mode==='acquire',selected=Boolean(v?.selection);
 $$('[data-mutate]').forEach(button=>button.disabled=busy);
 $$('[data-ui]').forEach(button=>button.disabled=state.uiBusy>0);
 $('#prepare').disabled=busy||!state.review||!acquire;
 $('#resume-preparation').disabled=busy||!state.review||!acquire||!selected;
 $('#selection-form button').disabled=busy||!acquire;
 $('#run').disabled=busy||!selected||v?.source?.release?.mode!=='NATIVE_X402';
 $('#recover').disabled=busy||!selected||!acquire;
 $('#cancel').disabled=state.uiBusy>0||!v?.active;
 for(const id of ['account','finalize','deliver','export'])$('#'+id).disabled=busy||!selected||!acquire;
 $('#receive').disabled=busy||!v?.delivery;$('#reopen').disabled=busy||!v?.received;
 $('#preview-rows').disabled=state.uiBusy>0||Boolean(v?.active)||!v?.delivery;
 $('#save-folder').disabled=state.uiBusy>0||Boolean(v?.active)||!v?.delivery||!window.showDirectoryPicker;
 $('#load-selection').disabled=state.uiBusy>0||!selected;
 $$('#retry-form button').forEach(b=>b.disabled=busy||!selected||v?.source?.release?.mode!=='NATIVE_X402');
 $('[data-approve]').forEach(b=>b.disabled=state.uiBusy>0||b.dataset.approvalState!=='AWAITING_OPERATOR');
}
async function guarded(work){state.uiBusy++;controls();try{return await work();}catch(error){notice(message(error),true);}finally{state.uiBusy--;controls();}}
function selectedRequest(){
 const form=$('#selection-form').elements;
 return {intentId:form.intentId.value,acceptIndex:Number(form.acceptIndex.value),query:form.query.value,
  maxPages:Number(form.maxPages.value),maxTotalAtomic:form.maxTotalAtomic.value,
  maxRows:Number(form.maxRows.value),maxPageBytes:Number(form.maxPageBytes.value)};
}
function fillSelection(selected){
 const form=$('#selection-form').elements;for(const [key,item]of Object.entries(selected??{}))if(form[key])form[key].value=String(item);
 state.review=null;state.reviewEpoch++;$('#selection-review').hidden=true;
}
function renderPrior(){
 const original=pending(),node=$('#prior-request');node.replaceChildren();node.hidden=!original||original.instanceId===state.identity?.instanceId;
 if(node.hidden)return;
 node.append(element('h3','Retained request from a prior listener'),
  element('p','The original request '+original.id+' ('+original.action+') belonged to an earlier host instance. The original Buyer state below is the recovery authority. No action has been resubmitted.'));
 const inspect=element('button','Inspect original acquisition');inspect.addEventListener('click',()=>showView('acquisition'));
 const dismiss=element('button','I have reviewed the original state');dismiss.addEventListener('click',()=>{setPending(null);renderPrior();});
 node.append(inspect,dismiss,details('Original browser request',original));
}
function renderSource(){
 const v=state.view,h=v.source;$('#release-mode').textContent=h?.release?.mode??v.mode.toUpperCase();
 if(!h){$('#source-cards').textContent='No original handoff is available.';return;}
 cards($('#source-cards'),[
  ['Merchant release',h.release.label||h.release.id,h.release.digest],
  ['Source observations',h.capture.rows,'Capture '+h.capture.id],
  ['Retained snapshot',h.dataset.baselineSnapshot,'Original dataset · '+h.dataset.rowCount+' rows']]);
 fields($('#source-terms'),[['Resource',h.resource],['Mode',h.release.mode],['Facilitator',h.release.facilitator],
  ['Accepted terms',h.offer.accepts],['Release ID',h.release.id],['Public origin',h.release.publicOrigin]]);
 fields($('#source-provenance'),[['Provenance',h.provenance],['Named review',h.sourceReview.id],
  ['Decision',h.sourceReview.decision],['Study workspace',h.workspaceId]]);
 fields($('#source-study'),[['Study SHA-256',h.study.sha256],['Study bytes',h.study.bytes],['Source manifest',h.study.manifestSha256],
  ['Reports',h.study.reports],['Source file count',h.study.files.length]]);
 const files=element('div',undefined,'actions');for(const file of v.sourceFiles??[]){
  const button=element('button','Download '+file.name);button.dataset.ui='';button.addEventListener('click',()=>guarded(()=>downloadFile('source',file)));files.append(button);
 }$('#source-study').append(files);$('#handoff-json').textContent=json(h);
 $('#run-explanation').textContent=h.release.mode==='NATIVE_X402'?
  'Run uses this saved native merchant release and original operator. Each page opens the original SF81 approval here.':
  'This handoff identifies a challenge-only seller. Source review and portable study access are available; paid acquisition needs a distinct published native merchant release and its matching original handoff.';
}
function renderNative(){
 const v=state.view,n=v.inspection?.native??null;
 $('#native-state').textContent=n?.status??(v.selection?'Preparation needs reconciliation':'Not prepared');
 cards($('#native-summary'),[['Original request',v.selection?.selection?.intentId,v.selection?.requestSha256],
  ['Completed pages',n?.completedPages,'Original native session'],['Acquired rows',n?.acquiredRows,n?.snapshot??'No acquired snapshot']]);
 table($('#native-pages'),n?.pages??[]);$('#native-json').textContent=json(v.inspection??{selection:v.selection,error:v.inspectionError});
 const active=$('#active-job');active.hidden=!v.active;active.replaceChildren();
 if(v.active){active.append(element('h3','Active original operation: '+v.active.action),element('p','Request '+v.active.id),element('p','You can keep this page open for original page approvals. The host retains this request if the page closes.'));}
 table($('#job-history'),[...v.jobs].reverse(),['id','action','state','createdAt','completedAt',{label:'Original result',render:job=>details('Open result / error',job.result??job.error)}]);
 const approvals=$('#approval-list');approvals.replaceChildren();
 for(const entry of v.approvals??[]){
  const card=element('section',undefined,'approval');card.append(element('h3','Original page approval'),
   element('p','Intent '+entry.intentId),element('p','State '+entry.state+' · expires '+entry.expiresAt));
  const fieldsNode=element('div');fields(fieldsNode,[['Request SHA-256',entry.review.request_sha256],
   ['Complete accepted terms',entry.review.complete_original_accepted_terms],['Current native budget estimate',entry.current_native_budget_estimate]]);
  card.append(fieldsNode,details('Complete original native review',entry.review));
  const buttons=element('div',undefined,'actions');
  for(const [decision,label]of [['approve','Approve exact original page'],['reject','Reject this page']]){
   const b=element('button',label,decision==='approve'?'primary':'');b.dataset.approve='';b.dataset.approvalState=entry.state;
   b.disabled=entry.state!=='AWAITING_OPERATOR';b.addEventListener('click',()=>guarded(async()=>{
    await api('/api/approval',{method:'POST',body:{intent:entry.intentId,approvalId:entry.id,
     requestSha256:entry.review.request_sha256,decision}});await refresh();
   }));buttons.append(b);
  }card.append(buttons);approvals.append(card);
 }
}
function renderAccounting(){
 const account=state.view.accounting??state.view.delivery?.accounting;
 cards($('#account-summary'),[['Authority',account?.recordAuthority],['Mode',account?.mode],
  ['Original entries',account?.entries?.length,account?.interrupted?'Original accounting was interrupted':'']]);
 table($('#account-entries'),account?.entries??[]);$('#account-json').textContent=json(account);
}
function renderDelivery(){
 const v=state.view,d=v.delivery,r=v.received;$('#delivery-state').textContent=r?'RECEIVED':d?'EXPORTED':'No completed delivery';
 cards($('#delivery-summary'),[['Manifest',d?.manifestSha256],['Dataset rows',d?.manifest?.dataset?.rows,d?.manifest?.dataset?.snapshot],
  ['Receiving',r?.receivingId,r?.directory]]);
 table($('#delivery-files'),v.deliveryFiles??[],['name','bytes','sha256',{label:'File',render:file=>{
  const button=element('button','Download');button.dataset.ui='';button.addEventListener('click',()=>guarded(()=>downloadFile('delivery',file)));return button;}}]);
 $('#delivery-json').textContent=json({delivery:d,received:r});
 $('#folder-help').textContent=window.showDirectoryPicker?
  'Choose an empty folder or the same incomplete original download. Every file is checked against this delivery manifest; existing different bytes are preserved and refused.':
  'This browser supports individual original file downloads. Use the original native export/receive commands to transfer the complete directory, or a desktop browser with folder download support.';
}
function render(){
 const v=state.view;if(!v)return;$('#subtitle').textContent=v.label+' · '+v.mode+' mode';
 $('#footer-identity').textContent='Workspace '+v.id+' · instance '+state.identity.instanceId;
 $('#identity-json').textContent=json(state.identity);$('#receive-mode-request').hidden=v.mode==='acquire';
 $('#receive-mode-request').textContent=v.mode==='inspect'?'This host opens the original handoff and study for inspection. Select an acquire-mode host with an existing original operator to prepare and run the Buyer.':'This console opens a complete delivery. Acquisition uses an acquire-mode host with an existing original operator.';
 renderSource();renderNative();renderAccounting();renderDelivery();renderPrior();
 if(!state.initial){
  const select=$('#selection-form').elements.acceptIndex;select.replaceChildren();
  for(const[acceptIndex,terms]of(v.source?.offer?.accepts??[]).entries()){
   const option=element('option',acceptIndex+' · '+value(terms.network)+' · '+value(terms.asset)+' · '+value(terms.amount??terms.maxAmountRequired));
   option.value=String(acceptIndex);select.append(option);
  }
  const advertised=v.source?.offer?.extensions?.bazaar?.schema?.properties?.input?.properties?.queryParams?.properties??{};
  $('#query-help').textContent='Advertised query fields: '+Object.keys(advertised).filter(x=>x!=='snapshot').join(', ')+'. The original retained snapshot is fixed.';
  $('#selection-form').elements.maxPages.max=v.capabilities.maxPages;$('#selection-form').elements.maxPageBytes.max=v.capabilities.maxPageBytes;
  fillSelection(v.selection?.selection??{intentId:crypto.randomUUID(),query:'limit=50'});
  $('#export-id').value=v.delivery?.manifest?.id??'openaq-export-'+crypto.randomUUID();
  $('#receiving-id').value=v.received?.receivingId??'openaq-receive-'+crypto.randomUUID();state.initial=true;
 }
 controls();
}
async function refresh(){
 if(state.refreshing)return state.refreshing;
 state.refreshing=(async()=>{
  state.view=await api('/api/state');render();
  const original=pending(),same=original?.instanceId===state.identity.instanceId;
  if(same){const found=state.view.jobs.find(job=>job.id===original.id);
   if(found&&['COMPLETE','ERROR'].includes(found.state)){
    setPending(null);notice(found.state==='COMPLETE'?'Original '+found.action+' completed.':value(found.error?.code),found.state==='ERROR');
   }
  }
  clearTimeout(state.poll);
  if(state.view.active||same&&pending())state.poll=setTimeout(()=>refresh().catch(error=>notice(message(error),true)),1200);
  return state.view;
 })();
 try{return await state.refreshing;}finally{state.refreshing=null;}
}
async function action(action,input){
 const id=crypto.randomUUID(),retained={id,action,input,instanceId:state.identity.instanceId,consoleId:state.identity.consoleId};
 setPending(retained);
 try{const job=await api('/api/actions',{method:'POST',body:{id,action,input}});
  notice('Original '+action+' accepted as '+job.id+'.');await refresh();
 }catch(error){
  if(error.status&&error.status>=400&&error.status<500)setPending(null);
  else notice('The HTTP result is unavailable. Retain request '+id+' and refresh the original state before continuing.',true);
  throw error;
 }
}
function requestInput(){if(!state.view.selection)throw Error('Prepare the original selection first.');return {requestSha256:state.view.selection.requestSha256};}
async function fileBytes(kind,file){
 const response=await fetch('/api/files?'+new URLSearchParams({kind,name:file.name}),{headers:{authorization:'Bearer '+token},redirect:'error'});
 if(!response.ok||response.headers.get('x-openaq-customer-instance')!==state.identity.instanceId||
  response.headers.get('x-content-sha256')!==file.sha256||Number(response.headers.get('content-length'))!==file.bytes)
  throw Error('The selected original file changed.');
 if(file.bytes>256*1024*1024)throw Error('This file exceeds the browser download limit. Use the original native delivery directory.');
 const result=await response.arrayBuffer();const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',result))].map(x=>x.toString(16).padStart(2,'0')).join('');
 if(result.byteLength!==file.bytes||hash!==file.sha256)throw Error('The downloaded bytes do not match the original manifest.');
 return result;
}
async function downloadFile(kind,file){
 const raw=await fileBytes(kind,file),url=URL.createObjectURL(new Blob([raw],{type:'application/octet-stream'}));
 const a=element('a');a.href=url;a.download=file.name.split('/').at(-1);a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
 notice('Downloaded original '+file.name+'; SHA-256 '+file.sha256+'.');
}
async function folderDownload(){
 const selected=structuredClone(state.view.deliveryFiles),root=await window.showDirectoryPicker({mode:'readwrite'}),
  expected=new Set(selected.map(file=>file.name));
 async function inspect(dir,prefix=''){
  for await(const[name,entry]of dir.entries()){
   const path=prefix+name;
   if(entry.kind==='directory'){if(![...expected].some(x=>x.startsWith(path+'/')))throw Error('The chosen folder has an unrelated directory: '+path);await inspect(entry,path+'/');}
   else if(!expected.has(path))throw Error('The chosen folder has an unrelated file: '+path);
  }
 }await inspect(root);
 for(const file of selected){
  const parts=file.name.split('/');if(parts.some(part=>!part||part==='.'||part==='..'||part.includes('\\')))throw Error('Invalid original member path.');
  let directory=root;for(const part of parts.slice(0,-1))directory=await directory.getDirectoryHandle(part,{create:true});
  let target;try{
   target=await directory.getFileHandle(parts.at(-1));const existing=await target.getFile(),raw=await existing.arrayBuffer();
   const actual=[...new Uint8Array(await crypto.subtle.digest('SHA-256',raw))].map(x=>x.toString(16).padStart(2,'0')).join('');
   if(raw.byteLength!==file.bytes||actual!==file.sha256)throw Error('Existing different bytes were preserved: '+file.name);
   continue;
  }catch(error){if(error.name!=='NotFoundError')throw error;}
  const bytes=await fileBytes('delivery',file);target=await directory.getFileHandle(parts.at(-1),{create:true});
  const writer=await target.createWritable();try{await writer.write(bytes);await writer.close();}catch(error){await writer.abort().catch(()=>{});throw error;}
 }
 notice('Downloaded all '+selected.length+' original files. Initialize the original receiving workflow with this complete folder and manifest '+state.view.delivery.manifestSha256+'.');
}
$$('[data-view]').forEach(button=>button.addEventListener('click',()=>showView(button.dataset.view)));
$('#refresh').addEventListener('click',()=>guarded(refresh));
$('#load-selection').addEventListener('click',()=>fillSelection(state.view.selection.selection));
$('#selection-form').addEventListener('input',()=>{state.review=null;state.reviewEpoch++;$('#selection-review').hidden=true;controls();});
$('#selection-form').addEventListener('submit',event=>{event.preventDefault();guarded(async()=>{
 const input=selectedRequest(),epoch=state.reviewEpoch,result=await api('/api/review',{method:'POST',body:input});
 if(epoch!==state.reviewEpoch||JSON.stringify(input)!==JSON.stringify(selectedRequest()))throw Error('The selection changed during review. Review the current values again.');
 state.review=result;fields($('#review-fields'),[['Review SHA-256',result.reviewSha256],['Original operator configuration',result.operatorConfigurationSha256],
  ['Snapshot',result.snapshot],['Original request SHA-256',result.originalRequestSha256]]);
 $('#review-json').textContent=json(result.originalRequest);$('#selection-review').hidden=false;notice('Exact selection reviewed. Preparation retains it without reserving funds.');
 });});
for(const[id,name]of [['prepare','prepare'],['resume-preparation','resumePreparation']])$('#'+id).addEventListener('click',()=>guarded(async()=>{
 if(!state.review)throw Error('Review the current selection first.');
 await action(name,{selection:state.review.selection,reviewSha256:state.review.reviewSha256});showView('acquisition');
}));
for(const[id,name]of [['run','run'],['recover','recover'],['account','account'],['finalize','finalize'],['deliver','deliver']])
 $('#'+id).addEventListener('click',()=>guarded(()=>action(name,requestInput())));
$('#cancel').addEventListener('click',()=>guarded(async()=>{await api('/api/cancel',{method:'POST',body:{id:state.view.active.id}});await refresh();}));
$('#retry-form').addEventListener('submit',event=>{event.preventDefault();guarded(async()=>{
 const form=event.target.elements,input={...requestInput(),expectedAttemptSha256:form.expectedAttemptSha256.value};
 if(form.kind.value==='unpaid')input.retryUnpaid=true;else input.retryExpired=JSON.parse(form.retryExpired.value);
 await action('run',input);
 });});
$('#export').addEventListener('click',()=>guarded(()=>action('export',{...requestInput(),exportId:$('#export-id').value})));
$('#receive').addEventListener('click',()=>guarded(()=>action('receive',{receivingId:$('#receiving-id').value,manifestSha256:state.view.delivery.manifestSha256})));
$('#reopen').addEventListener('click',()=>guarded(()=>action('reopen',{})));
$('#save-folder').addEventListener('click',()=>guarded(folderDownload));
$('#preview-rows').addEventListener('click',()=>guarded(async()=>{
 const selected=state.view.delivery.manifestSha256,result=await api('/api/rows?limit=100');
 if(state.view.delivery?.manifestSha256!==selected||result.manifestSha256!==selected)throw Error('The selected delivery changed. Refresh its original rows.');
 $('#dataset-preview').hidden=false;$('#rows-context').textContent='Showing '+result.rows.length+' of '+result.totalRows+' original rows · snapshot '+result.snapshot;
 table($('#rows-table'),result.rows);$('#semantics-json').textContent=json(result.semantics);
}));
window.addEventListener('pagehide',()=>clearTimeout(state.poll));
async function start(){
 if(!token){$('#connection').hidden=false;notice('The private host link is required.');return;}
 state.identity=await api('/api/identity');await refresh();
}
start().catch(error=>{notice(message(error),true);$('#connection').hidden=true;});
