// MIT. Receive complete named material reviews through the original catalogue Journal.
import {openRecipientReview,exportRecipientReview,selectRecipientAdoption} from '/recipient/review.mjs';
import {sha256File} from '/file-sha256.mjs';
import {createAuthorWorklistPanel} from '/catalog-author-worklist.mjs';
const MAX_RETURN=4*1024*1024,MAX_REQUEST=8*1024*1024,MAX_WORKING=32*1024*1024;
const pretty=value=>JSON.stringify(value,null,2)+'\n';
const bytes=value=>new TextEncoder().encode(value).length;
export function createCatalogRecipientController({container,api,perform,host,notice,element,attempt,read,getCatalog,isBusy}){
 const $=id=>container.querySelector('#'+id);
 let original=null,comparison=null,choices={},prepared=null,epoch=0,working=false,dirty=false,selected=null,sourceEpoch=0,comparisonEpoch=-1;
 const files=new WeakMap();let worklist=null;
 container.innerHTML='<h3>Receive a named customer review</h3><p class="help">Open the complete return from the existing offline recipient. Compare its original proposal and current author decision, choose every context, then save the exact request before applying it through this workspace.</p>'+
 '<label>Complete recipient return<input id="recipient-return-file" type="file" accept=".json,application/json"></label>'+
 '<div class="actions"><button id="recipient-compare" type="button">Compare with current catalogue</button><button id="recipient-save-review" type="button">Save author review choices</button></div>'+
 '<label>Reopen saved author review choices<input id="recipient-working-file" type="file" accept=".json,application/json"></label>'+
 '<p id="recipient-status" class="summary" role="status">Choose a complete named review.</p>'+
 '<div id="recipient-rows"></div>'+
 '<div class="two-column"><label>Receiving operator<input id="recipient-actor" maxlength="160"></label><label>Receiving reason<textarea id="recipient-reason" rows="3" maxlength="3000"></textarea></label></div>'+
 '<div class="actions"><button id="recipient-request" type="button">Download reviewed receiving request</button><button id="recipient-apply" type="button" class="primary">Apply saved reviewed request</button></div>'+
 '<p id="recipient-request-state" class="help">Choose every context and retain the exact request file before adoption.</p>'+
 '<label>Original request file for interrupted receiving<input id="recipient-request-file" type="file" accept=".json,application/json"></label>'+
 '<button id="recipient-resume" type="button">Resume original saved request</button>'+
 '<p class="help">The original request ID and file identity stay in the workspace recovery banner. After reopening, choose the same saved request file and use Retry original request. Read saved outcome first when the result is uncertain.</p>'+
 '<details><summary>Complete original comparison or receiving outcome</summary><pre id="recipient-details"></pre></details>';
 worklist=createAuthorWorklistPanel({container,element,getWorkspaceId:()=>host.workspaceId,getCatalog,
  isHeld:()=>working||isBusy()||host.busy||Boolean(host.pending),download:saveFile,report:notice,onReady:buttons,
  getDraft:()=>original&&comparison?{returnText:original.sourceText??original.text,draft:{comparison,choices,actor:$('recipient-actor').value,reason:$('recipient-reason').value}}:null,
  loadDraft(item,draft){
   epoch++;sourceEpoch++;prepared=null;
   const review=openRecipientReview(item.returnText),text=exportRecipientReview(review);
   original={review,text,sourceText:item.returnText,file:new File([text],'Material_Review_'+review.id+'.json',{type:'application/json'})};
   comparison=draft.comparison;comparisonEpoch=-1;choices=JSON.parse(JSON.stringify(draft.choices));
   $('recipient-return-file').value='';$('recipient-working-file').value='';
   $('recipient-actor').value=draft.actor;$('recipient-reason').value=draft.reason;
   dirty=false;render();status('Retained choices reopened without changing the catalogue. Compare with current catalogue before preparing a request; changed comparisons keep this draft in worklist history.');
  }});
 const binding=()=>JSON.stringify({workspace:host.workspaceId,id:getCatalog()?.id,revision:getCatalog()?.revision,edition:getCatalog()?.activeEditionId});
 const still=(generation,bound)=>generation===epoch&&bound===binding();
 const validComparison=()=>comparison&&sourceEpoch===comparisonEpoch&&comparison.catalog.id===getCatalog()?.id&&comparison.catalog.revision===getCatalog()?.revision&&comparison.catalog.activeEditionId===getCatalog()?.activeEditionId;
 function saveFile(name,text,type='application/json'){
  const file=new File([text],name,{type}),url=URL.createObjectURL(file),a=element('a',undefined,{href:url,download:name});
  document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);return file;
 }
 function invalidate(){epoch++;prepared=null;dirty=true;worklist?.schedule();buttons();}
 function status(text){$('recipient-status').textContent=text;}
 function setCatalog(value){
  worklist?.capture();worklist?.bind();
  const next=value?{id:value.id,revision:value.revision,edition:value.activeEditionId}:null;
  if(JSON.stringify(next)===JSON.stringify(selected))return;
  const other=selected?.id!==next?.id;selected=next;epoch++;prepared=null;
  if(other){original=null;comparison=null;choices={};dirty=false;$('recipient-return-file').value='';$('recipient-working-file').value='';$('recipient-actor').value='';$('recipient-reason').value='';$('recipient-rows').replaceChildren();$('recipient-details').textContent='';status('Choose a complete named review for this catalogue.');}
  else if(comparison)status('The selected catalogue changed. Saved choices remain visible; compare the original return again before preparing a new request.');
  worklist?.refresh();buttons();
 }
 async function fileText(file,limit){
  if(!file||file.size<1||file.size>limit)throw new Error('Choose a complete nonempty file within '+limit+' bytes.');
  const data=await file.arrayBuffer();if(data.byteLength!==file.size)throw new Error('The selected file changed while reading.');
  try{return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(data);}catch{throw new Error('The selected file is not complete UTF-8 text.');}
 }
 function render(){
  const target=$('recipient-rows');target.replaceChildren();
  if(!comparison)return;
  for(const row of comparison.rows){
   const article=element('article'),heading=element('h4',row.proposal.customerId+' · '+row.proposal.description);
   const table=element('table'),thead=element('thead'),tr=element('tr');
   for(const label of ['Decision','Original reviewed','Current author','Returned proposal'])tr.append(element('th',label,{scope:'col'}));thead.append(tr);table.append(thead);
   const tbody=element('tbody'),old=row.proposal.originalDecision,current=row.current,proposal=row.proposal;
   for(const [label,key]of [['Status','status'],['Material','materialId'],['Reason','note'],['Revision','revision']]){
    const line=element('tr');line.append(element('th',label,{scope:'row'}));
    for(const value of [old,current,{...proposal,materialId:proposal.material.materialId}])line.append(element('td',value?.[key]===undefined||value?.[key]===null?'No original decision':String(value[key])));
    tbody.append(line);
   }
   table.append(tbody);const wrap=element('div',undefined,{class:'table-wrap'});wrap.append(table);
   const label=element('label','Explicit receiving choice'),select=element('select',undefined,{'data-recipient-context':row.id});
   select.append(element('option','Choose for this context',{value:''}),element('option','Keep current decision',{value:'keep'}));
   if(row.eligible&&!row.unchanged)select.append(element('option','Adopt returned proposal',{value:'adopt'}));
   select.value=choices[row.id]??'';select.addEventListener('change',()=>{choices[row.id]=select.value;invalidate();});label.append(select);
   const detail=element('details');detail.append(element('summary','Complete original proposal, material and current record'),element('pre',pretty(row)));
   article.append(heading,element('p',row.reason,{class:'help'}),wrap,label,detail);target.append(article);
  }
  $('recipient-details').textContent=pretty(comparison);buttons();
 }
 async function compare(raw,restored=null){
  worklist.capture({archivePrevious:true});
  const retained=original&&comparison&&raw===(original.sourceText??original.text)?{comparison,choices:JSON.parse(JSON.stringify(choices)),actor:$('recipient-actor').value,reason:$('recipient-reason').value}:null;
  const catalogue=getCatalog();if(!catalogue)throw new Error('Select the original catalogue first.');
  const review=openRecipientReview(raw);
  if(review.base.catalog.id!==catalogue.id)throw new Error('This return belongs to a different original catalogue. Select that catalogue first.');
  const normalized=exportRecipientReview(review),file=new File([normalized],'Material_Review_'+review.id+'.json',{type:'application/json'});
  const generation=++epoch,bound=binding();working=true;buttons();
  try{
   const sha256=await sha256File(file);
   if(!still(generation,bound))throw new Error('The workspace or catalogue changed while reading this file.');
   const actual=await api('/api/catalog/recipient-preview',{name:file.name,bytes:file.size,sha256},false,file);
   if(!still(generation,bound))throw new Error('The original comparison completed after the selected source changed. Compare again.');
   if(actual.catalog.id!==catalogue.id||actual.returnSha256!==review.sha256)throw new Error('The returned comparison identifies a different source.');
   const prior=restored??retained;
   const sameComparison=prior&&actual.sha256===prior.comparison.sha256;
   if(restored){worklist.retainDraft(raw,{comparison:restored.comparison,choices:restored.choices,actor:restored.actor,reason:restored.reason});}
   original={review,text:normalized,sourceText:raw,file};comparison=actual;comparisonEpoch=sourceEpoch;prepared=null;choices=sameComparison?prior.choices:{};
   if(prior){$('recipient-actor').value=prior.actor;$('recipient-reason').value=prior.reason;}
   dirty=Boolean(prior)||Object.keys(choices).length>0;worklist.refresh();render();
   status('Review '+review.id+' by '+review.reviewer+' · '+actual.rows.length+' contexts · current catalogue revision '+actual.catalog.revision+'. '+(prior&&!sameComparison?'The comparison changed. Earlier choices remain in worklist history; choose explicitly against every new row.':'Choose explicitly for every context.'));
  }finally{working=false;buttons();}
 }
 async function prepare(){
  if(prepared&&prepared.binding===binding()){saveFile(prepared.file.name,prepared.raw);return;}
  if(!original||!validComparison())throw new Error('Compare the original return with the current selected catalogue first.');
  const request=selectRecipientAdoption(original.review,comparison,{requestId:crypto.randomUUID(),actor:$('recipient-actor').value,reason:$('recipient-reason').value,
   choices:comparison.rows.map(row=>({id:row.id,choice:choices[row.id]}))});
  const raw=pretty(request);if(bytes(raw)>MAX_REQUEST)throw new Error('The complete request exceeds 8 MiB. Preserve this review and split the original work.');
  const generation=epoch,bound=binding(),file=new File([raw],'Material_Review_Receive_'+request.requestId+'.json',{type:'application/json'});
  working=true;buttons();
  try{
   const sha256=await sha256File(file);if(!still(generation,bound))throw new Error('The original selection changed before request publication.');
   const candidate={request,raw,file,metadata:{requestId:request.requestId,name:file.name,bytes:file.size,sha256},binding:bound};
   files.set(file,sha256);await worklist.request(request,raw);
   if(!still(generation,bound))throw new Error('The catalogue changed while retaining this request. Its exact bytes remain in the worklist.');
   saveFile(file.name,raw);prepared=candidate;dirty=false;
   $('recipient-request-state').textContent='Saved request '+request.requestId+' · '+file.size+' bytes · SHA-256 '+sha256+'. Keep this exact file for recovery.';
  }finally{working=false;buttons();}
 }
 async function resumeOriginal(){
  const file=$('recipient-request-file').files[0],generation=++epoch,bound=binding();
  working=true;buttons();
  let metadata;
  try{
   const raw=await fileText(file,MAX_REQUEST),request=JSON.parse(raw);
   if(!request||raw!==pretty(request)||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(request.requestId??''))
    throw new Error('Choose the exact complete original receiving request file.');
   const review=openRecipientReview(request.reviewText);
   if(review.base.catalog.id!==getCatalog()?.id)throw new Error('Select the original catalogue named by this saved request.');
   const sha256=await sha256File(file);
   if(!still(generation,bound)||$('recipient-request-file').files[0]!==file)throw new Error('The original request selection changed.');
   files.set(file,sha256);metadata={requestId:request.requestId,name:file.name,bytes:file.size,sha256};
  }finally{working=false;buttons();}
  if(!still(generation,bound))throw new Error('The original catalogue changed before request recovery.');
  await perform('catalog-recipient-receive',metadata);
 }
 async function transmitFile(pending){
  const file=prepared?.request.requestId===pending.payload.requestId?prepared.file:$('recipient-request-file').files[0];
  if(!file)throw new Error('Choose the exact saved request '+pending.payload.name+' before retrying its original request ID.');
  if(file.size!==pending.payload.bytes)throw new Error('The selected request byte count differs from the retained original.');
  const hash=files.get(file)??await sha256File(file);files.set(file,hash);
  if(hash!==pending.payload.sha256)throw new Error('The request file differs from the retained SHA-256. Keep the original request.');
  return api('/api/catalog-recipient-receive',pending.payload,false,file);
 }
 function saveWorking(){
  if(!original||!comparison)throw new Error('Compare the original return first.');
  const value={schema:'stellar-forge.material-author-review.v1',workspaceId:host.workspaceId,catalogId:comparison.catalog.id,
   reviewText:original.text,comparison,choices,actor:$('recipient-actor').value,reason:$('recipient-reason').value};
  const raw=pretty(value);if(bytes(raw)>MAX_WORKING)throw new Error('This complete author review exceeds 32 MiB. Save the original return and reviewed request separately.');
  saveFile('Material_Author_Review_'+original.review.id+'.json',raw);dirty=false;
  try{worklist.capture();void worklist.save();}catch(error){notice('The complete current author review was downloaded separately. Worklist retention: '+error.message,true);}
  buttons();
 }
 async function restoreWorking(file){
  const generation=++epoch,bound=binding(),raw=await fileText(file,MAX_WORKING);
  if(!still(generation,bound)||$('recipient-working-file').files[0]!==file)throw new Error('The saved review selection changed.');
  const value=JSON.parse(raw);
  if(value?.schema!=='stellar-forge.material-author-review.v1'||value.workspaceId!==host.workspaceId||value.catalogId!==getCatalog()?.id||
   typeof value.reviewText!=='string'||!value.comparison||!value.choices||typeof value.choices!=='object'||Array.isArray(value.choices)||
   typeof value.actor!=='string'||value.actor.length>160||typeof value.reason!=='string'||value.reason.length>3000||
   !Array.isArray(value.comparison.rows)||Object.entries(value.choices).some(([id,choice])=>{const row=value.comparison.rows.find(row=>row.id===id);return !row||!['','keep','adopt'].includes(choice)||choice==='adopt'&&(!row.eligible||row.unchanged);}))
   throw new Error('Choose the complete saved author review for this original workspace and catalogue.');
  await compare(value.reviewText,value);
 }
 function buttons(){
  const held=working||isBusy()||host.busy||Boolean(host.pending)||worklist?.isLoading(),canCompare=Boolean(getCatalog()&&($('recipient-return-file').files[0]||original));
  for(const control of container.querySelectorAll('button,input,select,textarea'))control.disabled=held;
  $('recipient-compare').disabled=held||!canCompare;
  $('recipient-save-review').disabled=held||!comparison;
  $('recipient-request').disabled=held||!validComparison()||!comparison.rows.length;
  $('recipient-apply').disabled=held||!prepared||prepared.binding!==binding();
  $('recipient-request-file').disabled=working||isBusy()||host.busy||Boolean(host.pending&&host.pending.kind!=='catalog-recipient-receive');
  $('recipient-resume').disabled=held||!getCatalog()||!$('recipient-request-file').files[0];
  worklist?.buttons();
 }
 for(const id of ['recipient-actor','recipient-reason'])$(id).addEventListener('input',invalidate);
 $('recipient-return-file').addEventListener('change',()=>{sourceEpoch++;invalidate();status('Selected '+($('recipient-return-file').files[0]?.name??'no return')+'. Compare before receiving.');});
 $('recipient-request-file').addEventListener('change',buttons);
 $('recipient-resume').addEventListener('click',()=>attempt(()=>read(resumeOriginal)));
 $('recipient-compare').addEventListener('click',()=>attempt(()=>read(async()=>{
  worklist.capture({archivePrevious:true});
  const file=$('recipient-return-file').files[0],generation=++epoch,bound=binding();
  const raw=file?await fileText(file,MAX_RETURN):(original?.sourceText??original?.text);
  if(!still(generation,bound)||file&&$('recipient-return-file').files[0]!==file)throw new Error('The original return selection changed.');
  await compare(raw);
 })));
 $('recipient-working-file').addEventListener('change',()=>attempt(()=>read(async()=>{
  const file=$('recipient-working-file').files[0];if(!file)return;
  worklist.capture({archivePrevious:true});
  await restoreWorking(file);
 })));
 $('recipient-save-review').addEventListener('click',()=>attempt(async()=>saveWorking()));
 $('recipient-request').addEventListener('click',()=>attempt(()=>read(prepare)));
 $('recipient-apply').addEventListener('click',()=>attempt(async()=>{
  if(!prepared||prepared.binding!==binding())throw new Error('Save the exact reviewed request for this current catalogue first.');
  await perform('catalog-recipient-receive',prepared.metadata);
 }));
 buttons();
 return {setCatalog,buttons,transmitFile,hasUnsaved:()=>dirty||worklist.hasUnsaved(),
  restorePending(pending){if(pending?.kind==='catalog-recipient-receive')$('recipient-request-state').textContent='Original request '+pending.payload.requestId+' is retained. Read its saved outcome, or select '+pending.payload.name+' to retry.';buttons();},
  acceptOperation(operation){
   if(operation.kind!=='catalog-recipient-review')return false;
   worklist.outcome(operation);$('recipient-details').textContent=pretty(operation);prepared=null;epoch++;dirty=false;
   status('Original request '+operation.id+' · '+operation.state+'. Full result and return remain in its Journal; adopted history travels in the complete catalogue bundle.');buttons();return true;
  }};
}
