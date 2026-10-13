// MIT. Original operator issue, complete return inspection and explicit conflict adoption.
export function createCustomerReviewPanel({getState,perform,handle,download,fileInput,notice,persist}){
 const $=id=>document.getElementById(id),node=(tag,value)=>{const e=document.createElement(tag);if(value!==undefined)e.textContent=typeof value==='object'?JSON.stringify(value,null,2):String(value??'—');return e;};
 const detail=(label,value)=>{const e=node('details');e.append(node('summary',label),node('pre',value));return e;};
 const button=(label,action,id)=>{const e=node('button',label);e.type='button';e.dataset.customerAction=action;if(id)e.dataset.id=id;return e;};
 const id=()=>crypto.randomUUID(),copy=v=>structuredClone(v);
 let listPage=null,listKind='issues',listOffset=0,selectedIssue=null,inspection=null,issueOffset=0,selectedReturn=null,preview=null,previewOffset=0,previewStatus='',choices={},pending=null,requestHistory=[],seenWorkspace=null;
 const pendingKey=()=>getState()?'geoapify-customer-pending:'+getState().id:null;
 function retainedPending(){const key=pendingKey();if(!key)return undefined;const raw=localStorage.getItem(key);if(raw===null)return undefined;const value=JSON.parse(raw);if(value.workspaceId!==getState().id||value.schema!=='stellar-forge.geoapify-customer-pending.v1')throw new Error('The original saved customer request needs its original workspace.');return value.pending;}
 function retainPending(){const value={schema:'stellar-forge.geoapify-customer-pending.v1',workspaceId:getState().id,pending:copy(pending)};localStorage.setItem(pendingKey(),JSON.stringify(value));}
 const currentPreview=()=>preview&&preview.returnId===selectedReturn&&preview.currentIntakeSha256===getState()?.intake?.sha256;
 function clearDisplays(){for(const id of ['customer-issued','customer-preview','customer-files','customer-list'])$(id).replaceChildren();for(const id of ['customer-query-caption','customer-preview-caption','customer-list-caption'])$(id).textContent='';}
 function controls(busy=false){
  $('customer-issue-form').querySelector('button').disabled=busy||Boolean(pending)||!getState()?.editions?.length;
  $('customer-receive-form').querySelector('button').disabled=busy;
  $('customer-list-prev').disabled=busy||!listPage||listOffset===0;$('customer-list-next').disabled=busy||!listPage||listOffset+25>=listPage.page.total;
  $('customer-query-prev').disabled=busy||!inspection||issueOffset===0;$('customer-query-next').disabled=busy||!inspection||issueOffset+10>=inspection.project.queriesPage.total;
  $('customer-preview-prev').disabled=busy||!preview||previewOffset===0;$('customer-preview-next').disabled=busy||!preview||previewOffset+10>=preview.page.total;
  $('customer-export').disabled=busy||!selectedIssue;$('customer-adopt-form').querySelector('button').disabled=busy||Boolean(pending)||!currentPreview();
  $('customer-recover').disabled=busy||!pending;
 }
 function render(busy=false){
  const state=getState();if(!state)return;
  if(seenWorkspace&&seenWorkspace!==state.id){listPage=null;selectedIssue=null;inspection=null;selectedReturn=null;preview=null;choices={};pending=null;requestHistory=[];}
  if(seenWorkspace!==state.id){const retained=retainedPending();if(retained!==undefined)pending=retained;}seenWorkspace=state.id;
  const select=$('customer-edition'),previous=select.value;select.replaceChildren();
  for(const edition of [...state.editions].reverse()){const e=node('option',edition.name+' · '+edition.id);e.value=edition.id;select.append(e);}
  if(state.editions.some(e=>e.id===previous))select.value=previous;
  $('customer-summary').textContent=JSON.stringify(state.customerReviews??{issues:0,returns:0,adoptions:0});
  $('customer-pending').textContent=pending?'Original '+pending.action+' request '+pending.payload.requestId+' is retained. Recover that exact request before preparing another.':'No uncertain customer operation.';
  controls(busy);
 }
 function capture(){return {schema:'stellar-forge.geoapify-customer-operator.v1',workspaceId:getState()?.id,listKind,listOffset,selectedIssue,issueOffset,selectedReturn,previewOffset,previewStatus,choices:copy(choices),pending:copy(pending),requestHistory:copy(requestHistory)};}
 function restore(value){
  if(!value||value.schema!=='stellar-forge.geoapify-customer-operator.v1'||value.workspaceId!==getState()?.id)return;
  clearDisplays();
  listKind=['issues','returns','adoptions'].includes(value.listKind)?value.listKind:'issues';listOffset=0;selectedIssue=value.selectedIssue??null;issueOffset=0;selectedReturn=value.selectedReturn??null;previewOffset=0;previewStatus=value.previewStatus??'';
  choices=copy(value.choices??{});pending=copy(retainedPending()??value.pending??null);if(retainedPending()===null)pending=null;requestHistory=copy(value.requestHistory??[]);inspection=null;preview=null;listPage=null;
  $('customer-list-kind').value=listKind;$('customer-preview-status').value=previewStatus;
  $('customer-selection').textContent=selectedIssue?'Retained selection '+selectedIssue+'. Reopen issued review or preview to load its exact original source.':'Choose an issued review.';
  render(false);
 }
 function setPending(action,payload){const previous=pending;pending={action,payload:copy(payload),at:new Date().toISOString()};try{retainPending();}catch(error){pending=previous;throw new Error('The original request could not be saved locally. Free browser storage or use the complete native operation before submitting. '+error.message);}persist();}
 const definite=new Set(['GEOAPIFY_REVISION_CONFLICT','GEOAPIFY_CUSTOMER_PREVIEW_CHANGED','GEOAPIFY_CUSTOMER_RESOLUTION','GEOAPIFY_CUSTOMER_CONTEXT_CHANGED','GEOAPIFY_CUSTOMER_RETURN_EMPTY','GEOAPIFY_EDITION','GEOAPIFY_INTAKE_CHANGED']);
 async function recover(){
  if(!pending)throw new Error('No original customer request is pending.');
  const original=copy(pending);
  try{const result=await perform(original.action,original.payload);requestHistory.push({...original,outcome:'SAVED',result:copy(result)});pending=null;retainPending();persist();return result;}
  catch(error){if(definite.has(error.code)){requestHistory.push({...original,outcome:'REJECTED',code:error.code,message:error.message});pending=null;retainPending();persist();}throw error;}
 }
 async function listing(kind=listKind,offset=listOffset){
  const result=await perform('customer.list',{kind,offset,limit:25});listKind=kind;listOffset=offset;listPage=result;$('customer-list-kind').value=kind;
  $('customer-list-caption').textContent=kind+' '+Math.min(offset+1,result.page.total)+'–'+Math.min(offset+25,result.page.total)+' of '+result.page.total;
  $('customer-list').replaceChildren();
  for(const row of result.rows){const card=node('article');card.className='card';card.append(node('h3',row.title??row.id),detail('Complete retained identity',row));
   if(kind==='issues')card.append(button('Open issued original','inspect',row.id));
   if(kind==='returns')card.append(button('Compare returned choices','preview',row.id));
   if(kind==='adoptions')card.append(button('Open original return','preview',row.returnId));
   $('customer-list').append(card);}
  controls();
 }
 async function inspect(issueId=selectedIssue,offset=issueOffset){
  if(!issueId)throw new Error('Select an original issued review.');
  const result=await perform('customer.inspect',{issueId,offset,limit:10});$('customer-files').replaceChildren();selectedIssue=issueId;inspection=result;issueOffset=offset;selectedReturn=null;preview=null;previewOffset=0;
  $('customer-selection').textContent=result.project.title+' · '+result.project.recipient+' · edition '+result.project.edition.id+' · intake '+result.project.intakeSha256;
  $('customer-issued').replaceChildren(detail('Complete issued source identity',result.project));
  for(const q of result.project.queries){const card=node('article');card.className='card';card.append(node('h3',q.params.text??q.queryId),node('p',q.queryId),detail('Every original grouped source row',q.sourceRows),detail('Issued response and candidates',{responseSha256:q.responseSha256,candidates:q.candidates}),detail('Issued baseline decision',q.baselineDecision));$('customer-issued').append(card);}
  $('customer-query-caption').textContent='Original queries '+Math.min(offset+1,result.project.queriesPage.total)+'–'+Math.min(offset+10,result.project.queriesPage.total)+' of '+result.project.queriesPage.total;
  $('customer-preview').replaceChildren();$('customer-preview-caption').textContent='Choose a received customer return to compare.';controls();
 }
 function rememberChoices(){
  if(!preview)return;const retained=choices[preview.previewSha256]??{};
  for(const e of $('customer-preview').querySelectorAll('select[data-query]')){if(e.value)retained[e.dataset.query]={queryId:e.dataset.query,choice:e.value,expectedCurrentSha256:e.dataset.current};else delete retained[e.dataset.query];}
  choices[preview.previewSha256]=retained;
 }
 async function compare(returnId=selectedReturn,offset=previewOffset,status=previewStatus){
  if(!returnId)throw new Error('Select an original received return.');rememberChoices();
  const result=await perform('customer.preview',{returnId,offset,limit:10,...(status?{status}:{})});
  if(selectedIssue!==result.issueId){inspection=null;issueOffset=0;$('customer-issued').replaceChildren();$('customer-query-caption').textContent='Open this issued review to inspect its complete original queries.';}
  if(selectedIssue!==result.issueId||selectedReturn!==returnId)$('customer-files').replaceChildren();
  selectedReturn=returnId;selectedIssue=result.issueId;preview=result;previewOffset=offset;previewStatus=status;$('customer-preview-status').value=status;
  const retained=choices[result.previewSha256]??{};
  $('customer-preview-caption').textContent='Loaded filter '+(status||'all')+' · '+Math.min(offset+1,result.page.total)+'–'+Math.min(offset+10,result.page.total)+' of '+result.page.total+' · current intake '+result.currentIntakeSha256+' · preview '+result.previewSha256;
  $('customer-selection').textContent='Return '+returnId+' · issue '+selectedIssue+' · issued intake '+result.intakeSha256;
  $('customer-preview').replaceChildren(detail('Original source, return and current counts',{projectSha256:result.projectSha256,returnSha256:result.returnSha256,intakeSha256:result.intakeSha256,currentIntakeSha256:result.currentIntakeSha256,counts:result.counts}));
  for(const row of result.rows){
   const card=node('article');card.className='card';card.append(node('h3',row.params.text??row.queryId),node('p',row.status+' · '+row.queryId),
    detail('Every original grouped row',row.sourceRows),detail('Issued baseline',row.baselineDecision),detail('Current merchant decision',row.currentDecision),detail('Customer attributed choice',row.customerChoice),
    detail('Exact issued and current provider responses',{issued:row.issuedResponseSha256,current:row.currentResponseSha256,issuedCandidates:row.issuedCandidates,currentCandidates:row.currentCandidates}));
   if(row.customerChoice){const label=node('label','Explicit resolution'),select=node('select');select.dataset.query=row.queryId;select.dataset.current=row.currentSha256;
    for(const [key,title]of [['','Leave unresolved'],...(row.canChooseCustomer?[['customer','Use this exact customer choice']]:[]),['current','Keep current merchant decision'],['skip','Record skipped customer choice']]){const o=node('option',title);o.value=key;select.append(o);}
    select.value=retained[row.queryId]?.expectedCurrentSha256===row.currentSha256?retained[row.queryId].choice:'';select.onchange=rememberChoices;label.append(select);card.append(label);
   }
   $('customer-preview').append(card);
  }
  controls();
 }
 async function exportReview(){
  if(!selectedIssue)throw new Error('Select an original issued review.');
  const result=await perform('customer.export',{issueId:selectedIssue,...(selectedReturn?{returnId:selectedReturn}:{})});
  $('customer-files').replaceChildren(node('p','Complete retained export '+result.id));
  for(const file of result.files){const b=button(file.name+' · '+file.bytes+' bytes','download',result.id);b.dataset.filename=file.name;$('customer-files').append(b);}
 }
 $('customer-issue-form').addEventListener('submit',event=>{event.preventDefault();void handle(async()=>{
  if(pending)throw new Error('Recover the original pending customer operation first.');
  if(!$('customer-title').value.trim()||!$('customer-recipient').value.trim())throw new Error('Enter the actual review title and intended customer reviewer.');
  setPending('customer.issue',{requestId:id(),editionId:$('customer-edition').value,title:$('customer-title').value,recipient:$('customer-recipient').value});
  const result=await recover();await listing('issues',0);await inspect(result.id,0);await exportReview();
 });});
 $('customer-receive-form').addEventListener('submit',event=>{event.preventDefault();void handle(async()=>{
  const payload=await fileInput('customer-return-file','customer-return-path'),result=await perform('customer.receive',payload);
  $('customer-return-file').value='';await listing('returns',0);await compare(result.id,0,'');
 });});
 $('customer-adopt-form').addEventListener('submit',event=>{event.preventDefault();void handle(async()=>{
  if(pending)throw new Error('Recover the original pending customer operation first.');if(!currentPreview())throw new Error('Refresh the actual source-bound return preview.');
  rememberChoices();const readyAll=$('customer-ready-all').checked,resolutions=Object.values(choices[preview.previewSha256]??{});
  if(!readyAll&&!resolutions.length)throw new Error('Select explicit resolutions, or explicitly choose all current READY decisions.');
  if(readyAll&&!preview.counts.READY)throw new Error('This exact preview has no READY customer decisions.');
  if(!$('customer-adopter').value.trim()||!$('customer-adoption-note').value.trim())throw new Error('Enter the receiving reviewer and reason for these resolutions.');
  setPending('customer.adopt',{requestId:id(),returnId:selectedReturn,expectedPreviewSha256:preview.previewSha256,expectedIntakeSha256:getState().intake.sha256,...(readyAll?{readyAll:true}:{resolutions}),reviewer:$('customer-adopter').value,note:$('customer-adoption-note').value});
  await recover();$('customer-ready-all').checked=false;await compare(selectedReturn,0,previewStatus);notice('Original returned choices and explicit resolutions retained; selected native decisions saved atomically.');
 });});
 $('customer-recover').onclick=()=>void handle(async()=>{const result=await recover();notice('Original request recovered: '+result.id);await listing(listKind,listOffset);});
 $('customer-load-list').onclick=()=>void handle(()=>listing($('customer-list-kind').value,0));
 $('customer-list-prev').onclick=()=>void handle(()=>listing(listKind,Math.max(0,listOffset-25)));
 $('customer-list-next').onclick=()=>void handle(()=>listing(listKind,listOffset+25));
 $('customer-open-selected').onclick=()=>void handle(()=>inspect(selectedIssue,0));
 $('customer-query-prev').onclick=()=>void handle(()=>inspect(selectedIssue,Math.max(0,issueOffset-10)));
 $('customer-query-next').onclick=()=>void handle(()=>inspect(selectedIssue,issueOffset+10));
 $('customer-preview-form').addEventListener('submit',event=>{event.preventDefault();void handle(()=>compare(selectedReturn,0,$('customer-preview-status').value));});
 $('customer-preview-prev').onclick=()=>void handle(()=>compare(selectedReturn,Math.max(0,previewOffset-10),previewStatus));
 $('customer-preview-next').onclick=()=>void handle(()=>compare(selectedReturn,previewOffset+10,previewStatus));
 $('customer-export').onclick=()=>void handle(exportReview);
 $('customer-panel').addEventListener('click',event=>{const target=event.target.closest('[data-customer-action]');if(!target)return;void handle(async()=>{if(target.dataset.customerAction==='inspect')await inspect(target.dataset.id,0);else if(target.dataset.customerAction==='preview')await compare(target.dataset.id,0,'');else if(target.dataset.customerAction==='download')await download(target.dataset.id,target.dataset.filename);});});
 return {render,controls,capture,restore,clear(){inspection=null;preview=null;listPage=null;issueOffset=previewOffset=0;clearDisplays();}};
}
