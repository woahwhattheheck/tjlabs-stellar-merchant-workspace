// MIT. Original commissioning source and native customer selections remain in one workspace.
import {CommissioningCollectionsClient,commissioningCaptureArguments,commissioningImportArguments} from './client.mjs';

const $=id=>document.getElementById(id),copy=value=>structuredClone(value),today=()=>new Date().toISOString().slice(0,10);
const state={config:null,client:null,scope:'',revision:null,source:null,projects:[],selection:null,activeProjectId:null,
  sources:[],sourcePage:null,captures:[],capturePage:null,customers:new Map(),customerRows:[],candidate:null,
  upload:null,inspection:null,preview:null,capture:null,pending:null,pendingAbsent:false,busy:false};
function node(tag,attrs={},children=[]){
  const element=document.createElement(tag);
  for(const[key,value]of Object.entries(attrs)){
    if(value===null||value===undefined||value===false)continue;
    if(key==='class')element.className=value;
    else if(key==='text')element.textContent=value;
    else if(key==='dataset')Object.assign(element.dataset,value);
    else if(key.startsWith('on')&&typeof value==='function')element.addEventListener(key.slice(2),value);
    else if(key in element&&!key.startsWith('aria-'))element[key]=value;
    else element.setAttribute(key,String(value));
  }
  for(const child of [children].flat(Infinity)){
    if(child===null||child===undefined||child===false)continue;
    element.append(child instanceof Node?child:document.createTextNode(String(child)));
  }
  return element;
}
const button=(text,run,attrs={})=>node('button',{type:'button',text,...attrs,onclick:()=>perform(run)});
const muted=text=>node('small',{text});
const tag=text=>node('span',{class:'tag',text});
const code=text=>node('code',{text:String(text??'')});
const money=(amount,currency)=>amount===null?'Review cash attribution':String(amount??'—')+(currency?.code?' '+currency.code:'');
function replace(id,...children){$(id).replaceChildren(...children);}
function table(headers,rows){
  if(!rows.length)return node('p',{class:'muted',text:'No records in this selection.'});
  return node('div',{class:'table-wrap'},node('table',{},[
    node('thead',{},node('tr',{},headers.map(text=>node('th',{text})))),
    node('tbody',{},rows.map(cells=>node('tr',{},cells.map(cell=>node('td',{},cell))))),
  ]));
}
function notice(message,error=false){$('notice').hidden=!message;$('notice').textContent=message??'';$('notice').classList.toggle('error',error);}
function fault(error){
  const text=String(error?.message??error),codeValue=error?.code?' ['+error.code+']':'';
  notice(text+codeValue,true);
  if(state.pending){
    state.pending.error={message:text,code:error?.code??null,outcomeUnknown:error?.outcomeUnknown,
      reopenRequired:error?.reopenRequired,commitUncertainty:error?.commitUncertainty};
    saveLocal('pending',state.pending).catch(()=>{});renderPending();
  }
}
async function perform(work){try{return await work();}catch(error){fault(error);}}
function tab(name){
  for(const entry of document.querySelectorAll('[data-tab]'))entry.setAttribute('aria-selected',String(entry.dataset.tab===name));
  for(const item of document.querySelectorAll('main>.panel'))item.hidden=item.id!=='panel-'+name;
}
function revision(value){if(Number.isInteger(value?.revision))state.revision=state.revision===null?value.revision:Math.max(state.revision,value.revision);renderConnection();}
function renderConnection(){
  if(!state.config)return;
  $('connection').textContent='Workspace '+(state.config.workspaceId??'')+' · revision '+(state.revision??'—');
}
function actor(){const value=$('actor').value.trim();if(!value)throw new Error('Enter the recording operator before retaining a source or capture.');return value;}
function activeProject(){return state.projects.find(row=>row.id===state.activeProjectId)??null;}
function projectControl(id=state.activeProjectId){return state.selection?.projects.find(row=>row.projectId===id)??null;}
let database;
function openDatabase(){
  if(database)return database;
  database=new Promise((resolve,reject)=>{
    const request=indexedDB.open('original-commissioning-collections',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('values');
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
    request.onblocked=()=>reject(new Error('Close an older commissioning tab to finish opening saved browser requests.'));
  });
  return database;
}
async function localValue(key,mode,value){
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const transaction=db.transaction('values',mode==='read'?'readonly':'readwrite'),store=transaction.objectStore('values');
    const request=mode==='read'?store.get(state.scope+key):value===undefined?store.delete(state.scope+key):store.put(value,state.scope+key);
    let result;request.onsuccess=()=>{result=request.result;};request.onerror=()=>reject(request.error);
    transaction.oncomplete=()=>resolve(result);transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error??new Error('The browser request could not be retained.'));
  });
}
const loadLocal=key=>localValue(key,'read');
const saveLocal=(key,value)=>localValue(key,'write',value);
let draftSave=Promise.resolve();
function retainDraft(){
  if(!state.source||!state.selection)return Promise.resolve();
  const sourceId=state.source.id,value={sourceId,sourceSha256:state.source.sha256,selection:copy(state.selection),activeProjectId:state.activeProjectId};
  draftSave=draftSave.catch(()=>{}).then(()=>saveLocal('draft:'+sourceId,value));
  draftSave.then(()=>{$('draft-state').textContent='Draft retained in this browser.';},error=>{
    $('draft-state').textContent='Browser draft storage needs attention. Download the draft to preserve it.';fault(error);
  });
  return draftSave;
}
function changed(){
  state.previewToken=(state.previewToken??0)+1;state.preview=null;$('capture').disabled=true;$('draft-state').textContent='Saving draft…';retainDraft();renderProjectList();
}
async function sha256(text){
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map(value=>value.toString(16).padStart(2,'0')).join('');
}
async function intent(pending){
  const value=copy(pending.body);
  if(pending.kind==='CAPTURE')value.commissioningSourceId=pending.sourceId;
  delete value.revision;
  return sha256(JSON.stringify({action:pending.action,value},null,2)+'\n');
}
function ensureTarget(pending){
  if(pending.workspaceId!==state.config.workspaceId||pending.sourcesSha256!==state.config.sourcesSha256){
    throw new Error('Open this saved request in its original accounting workspace. Its workspace identity differs from the current service.');
  }
}
function downloadBytes(bytes,name,type='application/json'){
  const url=URL.createObjectURL(bytes instanceof Blob?bytes:new Blob([bytes],{type}));
  const link=node('a',{href:url,download:name});document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}
const downloadJson=(value,name)=>downloadBytes(JSON.stringify(value,null,2)+'\n',name,'application/json; charset=utf-8');
async function downloadResponse(response,name){
  const body=await response.blob();downloadBytes(body,name,response.headers.get('Content-Type')??'application/octet-stream');
}
function renderPending(){
  $('pending').hidden=!state.pending;
  if(!state.pending)return;
  const p=state.pending;
  $('pending-description').textContent=(p.kind==='SOURCE_IMPORT'?'Retain source':'Capture handover')+' · '+p.body.requestId+' · '+p.createdAt;
  $('pending-error').textContent=state.pendingAbsent?'The original workspace has no saved result for this exact request. Retry it or close the unsaved browser request.':p.error?.message??'The original request is retained here until its saved outcome is confirmed.';
  $('pending-find').disabled=state.busy;$('pending-retry').disabled=state.busy;
  $('pending-retire').hidden=!state.pendingAbsent;$('pending-retire').disabled=state.busy;
}
async function completePending(result,pending){
  const operation=result.operation;
  if(!operation||operation.id!==pending.body.requestId||operation.action!==pending.action||operation.intentSha256!==await intent(pending)){
    throw new Error('The returned operation does not match this retained request. Keep the original request and inspect its saved outcome.');
  }
  await saveLocal('pending',undefined);state.pending=null;state.pendingAbsent=false;renderPending();revision(result);
  if(result.source&&!result.capture){await loadSources();await selectSource(result.source.id);notice('Original source retained: '+result.source.id+'.');}
  else if(result.capture){await loadCaptures();await openCapture(result.capture.id);notice('Commissioning capture retained: '+result.capture.id+'.');}
}
async function executePending(){
  const pending=state.pending;if(!pending)return;
  ensureTarget(pending);state.busy=true;state.pendingAbsent=false;renderPending();
  try{
    const result=pending.kind==='SOURCE_IMPORT'?await state.client.importSource(copy(pending.body)):
      await state.client.capture(pending.sourceId,copy(pending.body));
    await completePending(result,pending);
  }catch(error){fault(error);}finally{state.busy=false;renderPending();}
}
async function startMutation(kind,body,sourceId=null){
  if(state.pending||state.busy)throw new Error('A saved request is already present or being retained. Find its outcome or retry that original request before replacing it.');
  state.busy=true;
  const pending={schema:'stellar-forge.commissioning-browser-request.v1',kind,sourceId,
    workspaceId:state.config.workspaceId,sourcesSha256:state.config.sourcesSha256,
    action:kind==='SOURCE_IMPORT'?'commissioning_source_imported':'commissioning_collections_captured',
    body:copy(body),createdAt:new Date().toISOString()};
  try{
    pending.intentSha256=await intent(pending);
    await saveLocal('pending',pending);state.pending=pending;renderPending();await executePending();
  }finally{state.busy=false;renderPending();}
}
async function findPending(){
  const pending=state.pending;if(!pending)return;ensureTarget(pending);state.busy=true;renderPending();
  try{
    const result=await state.client.request(pending.body.requestId);revision(result);
    if(result.found)await completePending(result,pending);
    else{state.pendingAbsent=true;notice('The original workspace has no saved result for this request ID. The same request remains available to retry.');}
  }finally{state.busy=false;renderPending();}
}
async function closeUnsaved(){
  if(!state.pending||!state.pendingAbsent||state.busy)return;
  state.busy=true;renderPending();
  try{
    await saveLocal('retired:'+state.pending.body.requestId,state.pending);
    await saveLocal('pending',undefined);state.pending=null;state.pendingAbsent=false;
    notice('The unsaved browser request is closed. Its original request bytes remain in browser history.');
  }finally{state.busy=false;renderPending();}
}
async function restoreRequest(file){
  if(state.pending||state.busy)throw new Error('Recover the existing saved request before loading another one.');
  state.busy=true;renderPending();
  try{
  if(!file||file.size>state.config.requestBytes)throw new Error('Choose an original request file within the document limit.');
  const pending=JSON.parse(await file.text());
  if(pending.schema!=='stellar-forge.commissioning-browser-request.v1'||!['SOURCE_IMPORT','CAPTURE'].includes(pending.kind)||!pending.body?.requestId){
    throw new Error('Choose a complete original commissioning browser request.');
  }
  ensureTarget(pending);
  const action=pending.kind==='SOURCE_IMPORT'?'commissioning_source_imported':'commissioning_collections_captured';
  if(pending.action!==action||pending.intentSha256!==await intent(pending))throw new Error('The saved request differs from its original operation identity.');
  await saveLocal('pending',pending);state.pending=pending;state.pendingAbsent=false;renderPending();
  notice('Original request loaded. Find its saved outcome before retrying.');
  }finally{state.busy=false;renderPending();}
}
async function allPages(read,query={}){
  const result=[];let offset=0,total=null,sourceRevision=null;
  do{
    const page=await read({...query,offset,limit:200});revision(page);
    if(!Array.isArray(page.items)||!Number.isInteger(page.total)||page.offset!==offset)throw new Error('The original record page is incomplete.');
    if(sourceRevision===null)sourceRevision=page.revision;
    else if(page.revision!==sourceRevision)throw new Error('The original workspace changed while reading the complete inventory. Refresh this selection.');
    result.push(...page.items);total=page.total;
    if(!page.items.length&&result.length<total)throw new Error('The original record page ended before its reported total.');
    offset+=page.items.length;
  }while(result.length<total);
  return result;
}
function sourceLabel(row){return row.label+' · '+row.sourceDate+' · '+row.projectCount+' projects';}
async function loadSources(more=false){
  const offset=more?state.sources.length:0;
  const page=await state.client.sources({search:$('source-search').value,offset,limit:50});revision(page);
  state.sources=more?[...state.sources,...page.items]:page.items;state.sourcePage=page;
  replace('source-list',table(['Source edition','Projects','Use'],state.sources.map(row=>[
    [node('strong',{text:row.label}),muted(row.name+' · '+(row.sourceDate??'source date not set')),code(row.sha256)],
    [String(row.projectCount),muted(row.captureCount+' saved captures')],
    button('Open source',()=>selectSource(row.id)),
  ])));
  $('source-more').hidden=state.sources.length>=page.total;renderSourceOptions();
}
function renderSourceOptions(){
  const selected=$('source-replaces').value,rows=new Map(state.sources.map(row=>[row.id,row]));
  if(state.source)rows.set(state.source.id,state.source);
  replace('source-replaces',node('option',{value:'',text:'First or independent edition'}),
    ...[...rows.values()].map(row=>node('option',{value:row.id,text:sourceLabel(row)})));
  $('source-replaces').value=selected;
}
async function fileBase64(file){
  const data=new Uint8Array(await file.arrayBuffer()),parts=[];
  for(let index=0;index<data.length;index+=32768)parts.push(String.fromCharCode(...data.subarray(index,index+32768)));
  return btoa(parts.join(''));
}
async function sourceInput(){
  const file=$('source-file').files[0];
  if(!file)throw new Error('Choose the original workshares JSON file.');
  if(file.size>state.config.sourceBytes)throw new Error('The original workshare source exceeds the 8 MiB source limit.');
  const currencyScales=JSON.parse($('source-scales').value);
  if(!currencyScales||Array.isArray(currencyScales)||typeof currencyScales!=='object')throw new Error('Use an object of currency codes and their minor-unit scales.');
  const value={file:{name:file.name,dataBase64:await fileBase64(file)},currencyScales};
  if($('source-label').value.trim())value.label=$('source-label').value.trim();
  if($('source-expected').value.trim())value.expectedSha256=$('source-expected').value.trim().toLowerCase();
  if($('source-replaces').value)value.replacesSourceId=$('source-replaces').value;
  if($('source-received').value)value.receivedAt=new Date($('source-received').value+'Z').toISOString();
  return value;
}
function clearInspection(){state.inspectionToken=(state.inspectionToken??0)+1;state.inspection=null;state.upload=null;$('source-import').disabled=true;$('source-inspection').hidden=true;}
async function inspectSource(){
  clearInspection();const ticket=state.inspectionToken,input=await sourceInput();
  if(ticket!==state.inspectionToken)return;
  const result=await state.client.inspectSource(input);if(ticket!==state.inspectionToken)return;
  state.upload=input;state.inspection=result;revision(result);
  $('source-inspection').hidden=false;$('source-import').disabled=false;
  replace('source-inspection',node('h3',{text:'Original source inspection'}),
    node('p',{text:result.projectCount+' projects · '+result.file.bytes+' bytes · '+(result.sourceDate??'No source date')}),
    node('p',{class:'mono',text:result.file.sha256}),
    table(['Project','Original fee','Milestones','Stage / owner'],result.projects.map(row=>[
      [node('strong',{text:row.name}),code(row.id)],money(row.fee,row.currency),String(row.milestones.length),
      [row.stage??'',muted(row.owner??'')],
    ])),node('p',{class:'muted',text:result.roundingRule}));
  notice('Original source inspected. Review its projects and retain this exact edition.');
}
async function importSource(){
  if(!state.inspection||!state.upload)throw new Error('Inspect the complete original source before retaining it.');
  const body=commissioningImportArguments(copy(state.upload),state.inspection,{actor:actor(),requestId:crypto.randomUUID()});
  await startMutation('SOURCE_IMPORT',body);
}
async function loadCaptures(more=false){
  const page=await state.client.captures({search:$('capture-search').value,offset:more?state.captures.length:0,limit:50});revision(page);
  state.captures=more?[...state.captures,...page.items]:page.items;state.capturePage=page;
  replace('capture-list',table(['Saved handover','Account date','Outcome','Open'],state.captures.map(row=>[
    [node('strong',{text:row.label}),muted(row.projectIds.length+' projects · '+row.fileCount+' retained files'),code(row.id)],
    [row.asOf,muted(row.createdAt)],tag(row.status),button('Open handover',()=>openCapture(row.id)),
  ])));
  $('capture-more').hidden=state.captures.length>=page.total;renderBaselineOptions();
}
function renderBaselineOptions(){
  const selected=state.selection?.baselineCaptureId??$('baseline').value;
  const rows=new Map(state.captures.map(row=>[row.id,row]));if(state.capture)rows.set(state.capture.id,state.capture);
  const options=[node('option',{value:'',text:'First capture'})];
  for(const row of rows.values())options.push(node('option',{value:row.id,text:row.asOf+' · '+row.label}));
  if(selected&&!rows.has(selected))options.push(node('option',{value:selected,text:'Retained baseline '+selected}));
  replace('baseline',...options);$('baseline').value=selected??'';
}
async function openCapture(id){
  const ticket=(state.captureToken??0)+1;state.captureToken=ticket;state.previewToken=(state.previewToken??0)+1;
  const result=await state.client.detail(id);if(ticket!==state.captureToken)return;
  revision(result);state.capture=result.capture;state.preview=null;
  renderReview(result.capture.review,result.capture);tab('review');
}


function blankControl(project){
  return {projectId:project.id,customerId:null,milestones:project.milestones.map(row=>({
    index:row.index,acceptedDate:null,plannedAcceptedDate:null,invoiceDays:project.sourceInvoiceDays,
    delayDays:0,invoiceLines:[],allocations:[],credits:[],
  })),receipts:[],refunds:[],xeroCycleIds:[]};
}
function completeControls(selection,projects){
  const controls=new Map((selection.projects??[]).map(row=>[row.projectId,row]));
  return projects.map(project=>{
    const prior=controls.get(project.id)??blankControl(project),milestones=new Map((prior.milestones??[]).map(row=>[row.index,row]));
    return {...blankControl(project),...prior,projectId:project.id,milestones:project.milestones.map(original=>{
      const row=milestones.get(original.index)??{};
      return {index:original.index,acceptedDate:null,plannedAcceptedDate:null,invoiceDays:project.sourceInvoiceDays,
        delayDays:0,invoiceLines:[],allocations:[],credits:[],...row,index:original.index};
    })};
  });
}
async function selectSource(id,{selection=null}={}){
  await retainDraft();const token=(state.sourceToken??0)+1;state.sourceToken=token;state.captureToken=(state.captureToken??0)+1;
  const [summary,projects,draft]=await Promise.all([
    state.client.source(id),allPages(query=>state.client.source(id,{...query,view:'projects'})),loadLocal('draft:'+id),
  ]);
  if(token!==state.sourceToken)return;
  revision(summary);state.source=summary.source;state.sourceFiles=summary.files;state.projects=projects;
  const saved=selection??(draft?.sourceSha256===state.source.sha256?draft.selection:null);
  state.selection=saved?copy(saved):{label:'Commissioning collections '+today(),asOf:today(),
    projectIds:projects.map(row=>row.id),projects:projects.map(blankControl),baselineCaptureId:null};
  state.selection.projectIds=(state.selection.projectIds??[]).filter(value=>projects.some(row=>row.id===value));
  state.selection.projects=completeControls(state.selection,projects);
  state.activeProjectId=projects.some(row=>row.id===draft?.activeProjectId)?draft.activeProjectId:projects[0]?.id??null;
  state.previewToken=(state.previewToken??0)+1;state.preview=null;state.capture=null;$('matching-empty').hidden=true;$('matching-workspace').hidden=false;
  $('selected-source-title').textContent=state.source.label;
  $('selected-source-meta').textContent=state.source.name+' · '+(state.source.sourceDate??'No source date')+' · '+state.source.sha256;
  $('review-label').value=state.selection.label;$('as-of').value=state.selection.asOf;
  renderSourceOptions();renderBaselineOptions();renderProjectList();renderProjectEditor();tab('matching');
  await retainDraft();await saveLocal('lastSource',{id:state.source.id,sha256:state.source.sha256});
  await Promise.all([loadCustomers(),loadCandidates(0)]);
}
function renderProjectList(){
  if(!state.selection)return;
  const selected=new Set(state.selection.projectIds),search=$('project-search').value.trim().toLowerCase();
  $('project-selection-count').textContent=selected.size+' / '+state.projects.length;
  replace('project-list',...state.projects.filter(row=>!search||[row.id,row.name,row.owner,row.stage].join(' ').toLowerCase().includes(search)).map(row=>{
    const control=projectControl(row.id),customer=state.customers.get(control?.customerId);
    const check=node('input',{type:'checkbox',checked:selected.has(row.id),'aria-label':'Include '+row.name,
      onchange:event=>{if(event.target.checked){if(!state.selection.projectIds.includes(row.id))state.selection.projectIds.push(row.id);}
        else state.selection.projectIds=state.selection.projectIds.filter(id=>id!==row.id);changed();}});
    const pick=button('',async()=>{
      state.activeProjectId=row.id;renderProjectList();renderProjectEditor();await retainDraft();
      await Promise.all([loadCustomers(),loadCandidates(0)]);
    },{'aria-current':String(state.activeProjectId===row.id)});
    pick.append(node('strong',{text:row.name}),muted(money(row.fee,row.currency)),
      muted(customer?.name??(control?.customerId?'Customer '+control.customerId:'Customer not selected')));
    return node('div',{class:'project-row'},[check,pick]);
  }));
}
async function loadCustomers(more=false){
  if(!state.source||!activeProject())return;
  const ticket=(state.customerTicket??0)+1,projectId=state.activeProjectId;state.customerTicket=ticket;
  const page=await state.client.candidates({view:'customers',sourceId:state.source.id,projectId,
    asOf:state.selection.asOf,search:$('customer-search').value,offset:more?(state.customerRows?.length??0):0,limit:200});
  if(ticket!==state.customerTicket||projectId!==state.activeProjectId)return;
  revision(page);state.customerRows=more?[...state.customerRows,...page.items]:page.items;state.customerPage=page;
  for(const row of page.items)state.customers.set(row.id,row);
  const current=projectControl()?.customerId,options=[node('option',{value:'',text:'Choose an original customer'})];
  for(const row of state.customerRows)options.push(node('option',{value:row.id,text:row.name+(row.reference?' · '+row.reference:'')}));
  if(current&&!state.customerRows.some(row=>row.id===current))options.push(node('option',{value:current,text:state.customers.get(current)?.name??current}));
  replace('customer-select',...options);$('customer-select').value=current??'';
  const text=state.customerRows.length+' of '+page.total+' original customers'+(current?' · Selected '+(state.customers.get(current)?.name??current):'');
  replace('customer-context',text,...(state.customerRows.length<page.total?[button('Load more customers',()=>loadCustomers(true))]:[]));
  renderProjectList();
}
function labeledInput(label,value,attributes,onchange){
  const input=node('input',{value:value??'',...attributes,oninput:event=>onchange(event.target.value)});
  return node('label',{},[label,input]);
}
function portionInput(value,onchange,label){
  return node('input',{type:'text',inputMode:'decimal',value:value??'',spellcheck:false,'aria-label':label,
    oninput:event=>{onchange(event.target.value);changed();}});
}
function shortId(value){return typeof value==='string'?value.slice(0,8):'';}
function selectedTable(kind,items,milestone=null){
  const title={invoiceLines:'Original invoice lines',allocations:'Allocated cash portions',credits:'Original credit-note lines',
    receipts:'Original customer receipts',refunds:'Original customer refunds'}[kind];
  const control=projectControl(),currency=activeProject()?.currency;
  const remove=index=>{items.splice(index,1);changed();renderProjectEditor();};
  let headers,rows;
  if(kind==='invoiceLines'){
    headers=['Invoice / original line','Net portion','Tax portion',''];
    rows=items.map((row,index)=>[
      [code(row.invoiceId),muted('Line '+row.invoiceLineId),node('details',{},[node('summary',{text:'Original invoice identity'}),code(row.invoiceSha256)])],
      portionInput(row.netAmount,value=>row.netAmount=value,'Invoice net portion '+row.invoiceLineId),
      portionInput(row.taxAmount,value=>row.taxAmount=value,'Invoice tax portion '+row.invoiceLineId),
      button('Remove',()=>remove(index)),
    ]);
  }else if(kind==='credits'){
    headers=['Credit / original invoice line','Net portion','Tax portion',''];
    rows=items.map((row,index)=>[[code(row.creditId),muted('Line '+row.invoiceLineId)],
      portionInput(row.netAmount,value=>row.netAmount=value,'Credit net portion '+row.invoiceLineId),
      portionInput(row.taxAmount,value=>row.taxAmount=value,'Credit tax portion '+row.invoiceLineId),button('Remove',()=>remove(index))]);
  }else{
    const idKey={allocations:'allocationId',receipts:'receiptId',refunds:'refundId'}[kind];
    headers=['Original record','Attributed amount',''];
    rows=items.map((row,index)=>[code(row[idKey]),portionInput(row.amount,value=>row.amount=value,'Attributed '+kind+' amount'),button('Remove',()=>remove(index))]);
  }
  return node('section',{},[node('h3',{text:title+' · '+(currency?.code??'')}),table(headers,rows)]);
}
function renderProjectEditor(){
  const project=activeProject(),control=projectControl();if(!project||!control)return;
  $('project-title').textContent=project.name;
  $('project-description').textContent=money(project.fee,project.currency)+' original source fee · '+project.milestones.length+' milestones · '+
    (project.stage??'')+(project.owner?' · '+project.owner:'')+(project.caseId?' · case '+project.caseId:'');
  $('customer-select').value=control.customerId??'';
  replace('milestone-editors',...project.milestones.map(original=>{
    const row=control.milestones.find(item=>item.index===original.index);
    const dates=node('div',{class:'fields'},[
      labeledInput('Recorded acceptance date',row.acceptedDate,{type:'date'},value=>{row.acceptedDate=value||null;changed();}),
      labeledInput('Planned acceptance date',row.plannedAcceptedDate,{type:'date'},value=>{row.plannedAcceptedDate=value||null;changed();}),
      labeledInput('Invoice term (days)',row.invoiceDays,{type:'number',min:0,max:36500,step:1},
        value=>{row.invoiceDays=value===''?null:Number(value);changed();}),
      labeledInput('Expected collection delay (days)',row.delayDays,{type:'number',min:0,max:36500,step:1},
        value=>{row.delayDays=value===''?0:Number(value);changed();}),
    ]);
    return node('section',{class:'milestone'},[
      node('h3',{text:'Milestone '+(original.index+1)+' · '+original.percentage+'% · '+money(original.amount,project.currency)}),
      node('p',{class:'muted',text:original.condition}),dates,
      selectedTable('invoiceLines',row.invoiceLines,row),selectedTable('allocations',row.allocations,row),selectedTable('credits',row.credits,row),
    ]);
  }));
  replace('project-cash',selectedTable('receipts',control.receipts),selectedTable('refunds',control.refunds));
  replace('project-cycles',table(['Saved native cycle',''],control.xeroCycleIds.map((id,index)=>[
    code(id),button('Remove',()=>{control.xeroCycleIds.splice(index,1);changed();renderProjectEditor();}),
  ])));
  const selected=$('candidate-milestone').value;
  replace('candidate-milestone',...project.milestones.map(row=>node('option',{value:String(row.index),text:'Milestone '+(row.index+1)+' · '+row.condition.slice(0,70)})));
  if(project.milestones.some(row=>String(row.index)===selected))$('candidate-milestone').value=selected;
}
function originalReference(value){
  if(!value)return null;
  return node('details',{},[node('summary',{text:'Original source reference'}),node('p',{class:'mono',text:value})]);
}
async function loadCandidates(offset=0){
  const project=activeProject(),control=projectControl();if(!state.source||!project||!control)return;
  const ticket=(state.candidateTicket??0)+1;state.candidateTicket=ticket;
  const view=$('candidate-view').value,query={view,sourceId:state.source.id,projectId:project.id,
    asOf:state.selection.asOf,search:$('candidate-search').value,offset,limit:25};
  if(!control.customerId){
    state.candidate=null;replace('candidate-list',node('p',{class:'muted',text:'Choose the original customer to browse its account records.'}));
    $('candidate-page').textContent='';$('candidate-prev').disabled=true;$('candidate-next').disabled=true;return;
  }
  query.customerId=control.customerId;
  const page=await state.client.candidates(query);if(ticket!==state.candidateTicket)return;
  revision(page);state.candidate={...page,query};renderCandidates();
}
function renderCandidates(){
  const page=state.candidate;if(!page)return;
  const view=page.view,project=activeProject(),currency=project.currency;
  $('candidate-context').textContent='Original '+view+' · account date '+page.asOf+' · '+(state.customers.get(page.customerId)?.name??page.customerId)+
    '. Choose an original record, then review the attributed portion above.';
  const headers=['Original record','Dated balance / source','Selection'];
  const rows=page.items.map(row=>{
    let description=[],facts=[],picker=null;
    if(view==='invoices'){
      description=[node('strong',{text:row.number??row.id}),muted('Issued '+row.issueDate+' · due '+row.dueDate),code(row.id),originalReference(row.sourceReference)];
      facts=[tag(row.paymentStatus??row.status),muted('Total '+money(row.total,currency)),muted('Paid '+money(row.paid,currency)+' · due '+money(row.amountDue,currency))];
      picker=node('select',{'aria-label':'Original line from invoice '+(row.number??row.id)},(row.lines??[]).map(line=>
        node('option',{value:line.id,text:line.id+' · '+line.description.slice(0,90)+' · net '+line.netAmount+' / tax '+line.taxAmount})));
    }else if(view==='allocations'){
      description=[node('strong',{text:row.invoiceNumber??'Invoice '+shortId(row.invoiceId)}),muted(row.receiptReference??'Receipt '+shortId(row.receiptId)),code(row.id),originalReference(row.sourceReference)];
      facts=[money(row.amount,row.currency),muted('Allocated '+row.allocatedDate),muted(row.releasedDate?'Released '+row.releasedDate:'Active allocation interval'),tag(row.active?'ACTIVE':'OUTSIDE ACCOUNT DATE')];
    }else if(view==='credits'){
      description=[node('strong',{text:row.number}),muted('Invoice '+row.invoiceNumber),code(row.id),muted(row.reason)];
      facts=[money(row.totals?.total,row.currency),muted('Credit date '+row.creditDate),tag(row.effective?'EFFECTIVE':'FUTURE')];
      picker=node('select',{'aria-label':'Original credited line from '+row.number},(row.lines??[]).map(line=>
        node('option',{value:line.invoiceLineId,text:line.invoiceLineId+' · '+line.description.slice(0,90)+' · net '+line.netAmount+' / tax '+line.taxAmount})));
    }else if(view==='receipts'){
      description=[node('strong',{text:row.reference??row.id}),muted(row.method??''),code(row.id)];
      facts=[money(row.amount,row.currency),muted('Received '+row.receivedDate+' · accounting '+row.accountingDate),
        muted('Allocated '+row.allocated+' · refunded '+row.refunded+' · available '+row.available),
        row.voidDate?tag('VOID '+row.voidDate):null,
        (row.bankSources??[]).length?muted(row.bankSources.length+' original bank source links'):null,
        row.replacesReceiptId?muted('Successor of '+row.replacesReceiptId):null];
    }else if(view==='refunds'){
      description=[node('strong',{text:row.reference??row.reason??row.id}),muted('Receipt '+shortId(row.receiptId)),code(row.id)];
      facts=[money(row.amount,row.currency),tag(row.effectiveStatus??row.status),muted('Effective '+row.effectiveDate),
        row.refundDate?muted('Refunded '+row.refundDate+' · accounting '+row.accountingDate):null,muted('Reserved '+row.reserved+' · refunded '+row.refunded)];
    }else{
      description=[node('strong',{text:row.label}),muted(row.organisation??''),code(row.id)];
      facts=[tag(row.status),muted('Account date '+row.asOf),muted(row.sourceCount+' retained provider sources'),muted('Original review '+row.reviewSha256)];
    }
    return [description,facts,[picker,button(view==='xeroCycles'?'Use saved cycle':'Add original portion',()=>addCandidate(view,row,picker?.value),
      {disabled:Boolean(picker&&!picker.options.length)||view==='invoices'&&!row.invoiceSha256})]];
  });
  replace('candidate-list',table(headers,rows));
  $('candidate-page').textContent=page.total?'Records '+(page.offset+1)+'–'+(page.offset+page.items.length)+' of '+page.total:'No records';
  $('candidate-prev').disabled=page.offset===0;$('candidate-next').disabled=page.offset+page.items.length>=page.total;
}
function addCandidate(view,row,lineId){
  const control=projectControl();if(!control||!control.customerId)throw new Error('Choose the original project customer.');
  const milestone=control.milestones.find(item=>item.index===Number($('candidate-milestone').value));
  let records,part,same;
  if(view==='invoices'){
    const line=row.lines.find(item=>item.id===lineId);if(!line||!row.invoiceSha256)throw new Error('Choose an original retained invoice line.');
    records=milestone.invoiceLines;part={invoiceId:row.id,invoiceSha256:row.invoiceSha256,invoiceLineId:line.id,netAmount:line.netAmount,taxAmount:line.taxAmount};
    same=item=>item.invoiceId===part.invoiceId&&item.invoiceLineId===part.invoiceLineId;
  }else if(view==='allocations'){records=milestone.allocations;part={allocationId:row.id,amount:row.amount};same=item=>item.allocationId===row.id;}
  else if(view==='credits'){
    const line=row.lines.find(item=>item.invoiceLineId===lineId);if(!line)throw new Error('Choose an original credited invoice line.');
    records=milestone.credits;part={creditId:row.id,invoiceLineId:line.invoiceLineId,netAmount:line.netAmount,taxAmount:line.taxAmount};
    same=item=>item.creditId===row.id&&item.invoiceLineId===line.invoiceLineId;
  }else if(view==='receipts'){records=control.receipts;part={receiptId:row.id,amount:row.amount};same=item=>item.receiptId===row.id;}
  else if(view==='refunds'){records=control.refunds;part={refundId:row.id,amount:row.amount};same=item=>item.refundId===row.id;}
  else{records=control.xeroCycleIds;part=row.id;same=item=>item===row.id;}
  if(records.some(same))throw new Error('This original record is already selected in this milestone or project. Edit its retained portion above.');
  records.push(part);changed();renderProjectEditor();
  notice(view==='xeroCycles'?'Original Xero cycle added to this project.':'Original record added. Review its exact attributed amount in this project before capturing.');
}
function selectionValue(){
  if(!state.source||!state.selection)throw new Error('Open an original source edition.');
  const selection=copy(state.selection);
  selection.projects=selection.projects.filter(row=>selection.projectIds.includes(row.projectId));
  return selection;
}
async function previewSelection(){
  if(!state.source)throw new Error('Open an original source edition.');
  const sourceId=state.source.id,selection=selectionValue(),ticket=(state.previewToken??0)+1;state.previewToken=ticket;
  await retainDraft();const result=await state.client.preview(sourceId,selection);revision(result);
  if(ticket!==state.previewToken||sourceId!==state.source?.id)return;
  state.preview=result;state.capture=null;renderReview(result.review);tab('review');
  notice('Complete cohort reviewed at original workspace revision '+result.revision+'.');
}
async function captureSelection(){
  if(!state.preview)throw new Error('Review the current complete cohort before capturing it.');
  const reviewed=state.preview,sourceId=reviewed.source?.id;
  if(!sourceId||sourceId!==state.source?.id)throw new Error('Open and review the source edition for this capture.');
  const body=commissioningCaptureArguments(reviewed,{actor:actor(),requestId:crypto.randomUUID()});
  await startMutation('CAPTURE',body,sourceId);
}
function downloadDraft(){
  if(!state.source)return;
  downloadJson({schema:'stellar-forge.commissioning-browser-draft.v1',workspaceId:state.config.workspaceId,
    sourcesSha256:state.config.sourcesSha256,sourceId:state.source.id,sourceSha256:state.source.sha256,
    selection:copy(state.selection)},'commissioning-'+state.source.id+'-draft.json');
}
async function loadDraft(file){
  if(!state.source)throw new Error('Open the original source edition before loading a draft.');
  if(!file||file.size>state.config.requestBytes)throw new Error('Choose a draft within the workspace document limit.');
  const value=JSON.parse(await file.text());
  if(value.schema!=='stellar-forge.commissioning-browser-draft.v1'||value.workspaceId!==state.config.workspaceId||
    value.sourcesSha256!==state.config.sourcesSha256||value.sourceId!==state.source.id||value.sourceSha256!==state.source.sha256){
    throw new Error('This draft belongs to another original workspace or source edition.');
  }
  if(!Array.isArray(value.selection?.projectIds)||!Array.isArray(value.selection?.projects))throw new Error('The complete project selection is missing.');
  for(const id of value.selection.projectIds)if(!state.projects.some(row=>row.id===id))throw new Error('This draft selects a project absent from the original source.');
  state.selection=copy(value.selection);state.selection.projects=completeControls(state.selection,state.projects);
  $('review-label').value=state.selection.label;$('as-of').value=state.selection.asOf;renderBaselineOptions();
  changed();renderProjectEditor();await loadCandidates(0);notice('Original draft loaded. Review the complete current account before capturing.');
}


// Original source and accounting values are rendered as text; monetary strings stay exact.
const reviewViewReportNames=new Set(['commissioning-review.json','commissioning-projects.csv',
  'commissioning-milestones.csv','commissioning-cash.csv','commissioning-findings.csv','commissioning-handover.html']);
function reviewViewRows(value){return Array.isArray(value)?value:[];}
function reviewViewText(value){return value===null||value===undefined||value===''?'—':String(value);}
function reviewViewMoney(value,currency){return value===null||value===undefined?muted('Needs attribution'):money(value,currency);}
function reviewViewLabel(value){return String(value).replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/_/g,' ');}
function reviewViewIdentity(label,id){
  return node('div',{},[node('div',{},[reviewViewText(label)]),id?code(id):null]);
}
function reviewViewDisclosure(title,build){
  const body=node('div',{},[]),view=node('details',{},[node('summary',{},[title]),body]);
  let built=false;
  view.addEventListener('toggle',()=>{
    if(view.open&&!built){const content=build();body.replaceChildren(content);built=true;}
  });
  return view;
}
function reviewViewOriginal(title,value){
  return reviewViewDisclosure(title,()=>node('pre',{},[JSON.stringify(value,null,2)]));
}
function reviewViewValue(value,depth=0){
  if(value===null||value===undefined)return muted('None');
  if(typeof value!=='object')return node('span',{},[String(value)]);
  if(depth>1)return reviewViewOriginal('Original values',value);
  if(Array.isArray(value)){
    if(!value.length)return muted('None');
    if(value.every(item=>item===null||typeof item!=='object'))return node('span',{},[value.map(reviewViewText).join(', ')]);
    return reviewViewOriginal(value.length+' original records',value);
  }
  const entries=Object.entries(value);
  if(!entries.length)return muted('No fields');
  return table(['Field','Value'],entries.map(([key,item])=>[reviewViewLabel(key),reviewViewValue(item,depth+1)]));
}
function reviewViewTable(headers,items,row,pageSize=100){
  const rows=reviewViewRows(items);
  if(!rows.length)return muted('No selected records.');
  if(rows.length<=pageSize)return table(headers,rows.map(row));
  const holder=node('div',{},[]);let offset=0;
  const draw=()=>{
    const previous=button('Previous',async()=>{offset=Math.max(0,offset-pageSize);draw();},{disabled:offset===0}),
      next=button('Next',async()=>{offset+=pageSize;draw();},{disabled:offset+pageSize>=rows.length}),
      navigation=node('div',{class:'actions'},[previous,
        muted((offset+1)+'–'+Math.min(rows.length,offset+pageSize)+' of '+rows.length),next]);
    holder.replaceChildren(table(headers,rows.slice(offset,offset+pageSize).map(row)),navigation);
  };
  draw();return holder;
}
function reviewViewTotals(totals,currency){
  return node('div',{},[
    table(['Source fee, net','Invoice net','Invoice tax','Unbilled source net','Billed above source net'],[[
      reviewViewMoney(totals.sourceFeeNet,currency),reviewViewMoney(totals.invoicedNet,currency),
      reviewViewMoney(totals.invoicedTax,currency),reviewViewMoney(totals.unbilledSourceNet,currency),
      reviewViewMoney(totals.billedAboveSourceNet,currency)]]),
    table(['Allocated cash','Credit net','Credit tax','Amount due','Credit balance'],[[
      reviewViewMoney(totals.allocatedGross,currency),reviewViewMoney(totals.creditedNet,currency),
      reviewViewMoney(totals.creditedTax,currency),reviewViewMoney(totals.amountDueGross,currency),
      reviewViewMoney(totals.creditBalanceGross,currency)]]),
    table(['Physical receipts','Refunds','Reserved refunds','Net recorded cash','Reconciled net cash'],[[
      reviewViewMoney(totals.receivedGross,currency),reviewViewMoney(totals.refundedGross,currency),
      reviewViewMoney(totals.reservedRefundGross,currency),reviewViewMoney(totals.netRecordedCash,currency),
      reviewViewMoney(totals.reconciledNetCash,currency)]])
  ]);
}
function reviewViewMilestone(milestone,currency){
  const dates=milestone.dates||{},totals=milestone.totals||{};
  return node('section',{class:'milestone'},[
    node('h3',{},['Milestone '+(milestone.index+1)+' · '+reviewViewText(milestone.condition)]),
    muted('Original fee share '+reviewViewText(milestone.sourcePercentage)+'%.'),
    table(['Source fee, net','Invoice net','Invoice tax','Allocated','Credit net','Credit tax','Due','Credit balance'],[[
      reviewViewMoney(totals.sourceFeeNet,currency),reviewViewMoney(totals.invoicedNet,currency),
      reviewViewMoney(totals.invoicedTax,currency),reviewViewMoney(totals.allocatedGross,currency),
      reviewViewMoney(totals.creditedNet,currency),reviewViewMoney(totals.creditedTax,currency),
      reviewViewMoney(totals.amountDueGross,currency),reviewViewMoney(totals.creditBalanceGross,currency)]]),
    table(['Recorded acceptance','Planned acceptance','Invoice term','Term source','Planned due','Expected collection'],[[
      reviewViewText(dates.acceptedDate),reviewViewText(dates.plannedAcceptedDate),
      dates.invoiceDays===null||dates.invoiceDays===undefined?'Unspecified':dates.invoiceDays+' days',
      reviewViewText(dates.invoiceTermSource),reviewViewText(dates.plannedInvoiceDueDate),
      reviewViewText(dates.expectedCollectionDate)]]),
    table(['Planning basis','Collection delay','Original invoice due dates','Active allocation dates','Original receipt dates'],[[
      reviewViewText(dates.planBasis),(dates.collectionDelayDays??0)+' days',
      reviewViewRows(dates.originalInvoiceDueDates).join(', ')||'—',
      reviewViewRows(dates.allocationDates).join(', ')||'—',reviewViewRows(dates.originalReceiptDates).join(', ')||'—']]),
    reviewViewDisclosure('Original invoice line bindings ('+reviewViewRows(milestone.bindings).length+')',()=>
      reviewViewTable(['Invoice and line','Bound net','Bound tax','Issued','Due','Status','Original identity'],
        milestone.bindings,row=>[
          reviewViewIdentity(row.invoiceNumber,row.invoiceId),reviewViewMoney(row.netAmount,currency),
          reviewViewMoney(row.taxAmount,currency),reviewViewText(row.issueDate),reviewViewText(row.dueDate),tag(row.status),
          node('div',{},[code(row.invoiceLineId),code(row.invoiceSha256),
            reviewViewOriginal('Line and original invoice balance',{line:row.originalLine,invoice:row.originalInvoice})])
        ])),
    reviewViewDisclosure('Original allocation portions ('+reviewViewRows(milestone.allocations).length+')',()=>
      reviewViewTable(['Allocation','Invoice / receipt','Amount','Allocated / released','Receipt actual / accounting','Status','Lineage'],
        milestone.allocations,row=>[
          code(row.allocationId),node('div',{},[code(row.invoiceId),code(row.receiptId)]),
          reviewViewMoney(row.amount,currency),
          node('div',{},[reviewViewText(row.allocatedDate),muted('Released: '+reviewViewText(row.releasedDate))]),
          node('div',{},[reviewViewText(row.actualReceiptDate),muted('Accounting: '+reviewViewText(row.receiptAccountingDate))]),
          tag(row.status),reviewViewOriginal('Original allocation',{
            replacesAllocationId:row.replacesAllocationId,dispositionId:row.dispositionId,original:row.original})
        ])),
    reviewViewDisclosure('Original credit portions ('+reviewViewRows(milestone.credits).length+')',()=>
      reviewViewTable(['Credit','Invoice / line','Net','Tax','Credit date','Status','Original line'],
        milestone.credits,row=>[
          reviewViewIdentity(row.creditNumber,row.creditId),node('div',{},[code(row.invoiceId),code(row.invoiceLineId)]),
          reviewViewMoney(row.netAmount,currency),reviewViewMoney(row.taxAmount,currency),
          reviewViewText(row.creditDate),tag(row.status),reviewViewOriginal('Original credited line',row.originalLine)
        ])),
    reviewViewOriginal('Original source milestone and rounding',milestone.sourceRounding)
  ]);
}
function reviewViewProject(project){
  const currency=project.currency,receipts=reviewViewRows(project.receipts),refunds=reviewViewRows(project.refunds),
    cycles=reviewViewRows(project.xeroCycles);
  const sourceFields={caseId:project.sourceCaseId,stage:project.sourceStage,owner:project.owner,
    sourceUrl:project.sourceUrl,sourceFee:project.sourceFee,sourceInvoiceDays:project.sourceInvoiceDays};
  return reviewViewDisclosure(project.name+' · '+currency.code+' · '+reviewViewText(project.customer?.name),()=>node('div',{},[
    table(['Original project','Customer','Source stage','Owner','Original case'],[[
      code(project.projectId),reviewViewIdentity(project.customer?.name,project.customerId),
      reviewViewText(project.sourceStage),reviewViewText(project.owner),reviewViewText(project.sourceCaseId)]]),
    reviewViewTotals(project.totals||{},currency),
    ...reviewViewRows(project.milestones).map(milestone=>reviewViewMilestone(milestone,currency)),
    node('h3',{},['Physical receipt portions']),
    reviewViewTable(['Receipt','Selected / effective','Actual date','Accounting date','Void date','Status','Original source and cash'],
      receipts,row=>[
        reviewViewIdentity(row.original?.reference,row.receiptId),
        node('div',{},[reviewViewMoney(row.amount,currency),node('small',{},['Effective: ',reviewViewMoney(row.effectiveAmount,currency)])]),
        reviewViewText(row.actualDate),reviewViewText(row.accountingDate),reviewViewText(row.voidDate),tag(row.status),
        reviewViewOriginal('Receipt, bank coverage and correction history',row.original)
      ]),
    node('h3',{},['Original refund portions']),
    reviewViewTable(['Refund / original receipt','Selected / effective','Reserved','Actual payout','Accounting date','Reversed','Status','Original record'],
      refunds,row=>[
        node('div',{},[code(row.refundId),code(row.receiptId)]),
        node('div',{},[reviewViewMoney(row.amount,currency),node('small',{},['Effective: ',reviewViewMoney(row.effectiveAmount,currency)])]),
        reviewViewMoney(row.reservedAmount,currency),reviewViewText(row.actualDate),
        reviewViewText(row.accountingDate),reviewViewText(row.reversedDate),tag(row.status),
        reviewViewOriginal('Original refund and receiving details',row.original)
      ]),
    node('h3',{},['Saved Xero cash cycles']),
    reviewViewTable(['Cycle','Original account date','Organisation','Status','Date scope','Original review'],
      cycles,row=>[
        code(row.cycleId),reviewViewText(row.asOf),reviewViewText(row.organisation),tag(row.status),
        reviewViewText(row.observationScope),reviewViewDisclosure('Source, documents and findings',()=>node('div',{},[
          code(row.reviewSha256),code(row.sourceFingerprint),
          reviewViewTable(['Source','Observed','Recorded','SHA-256'],row.sources,item=>[
            reviewViewIdentity(item.name,item.id),reviewViewText(item.observedAt),
            reviewViewText(item.recordedAt),code(item.sha256)]),
          reviewViewOriginal('Original document comparisons',row.documents),
          reviewViewOriginal('Original cycle findings',row.findings),
          reviewViewOriginal('Original package cohort',{packageId:row.packageId,packageIds:row.packageIds})
        ]))
      ]),
    reviewViewOriginal('Original collections cases and unassigned invoices',{
      cases:project.collectionCases,unassigned:project.unassignedCollections}),
    reviewViewOriginal('Original source project',{...sourceFields,original:project.sourceProject}),
    muted(project.cashAccountingScope||'')
  ]));
}
function reviewViewFindings(findings){
  return reviewViewTable(['Severity','Item','Project / milestone','Original finding and values'],
    findings,row=>[
      tag(row.severity),code(row.code),
      node('div',{},[reviewViewText(row.projectId),row.milestoneIndex===undefined?null:muted('Milestone '+(row.milestoneIndex+1))]),
      node('div',{},[node('p',{},[row.message]),reviewViewOriginal('Exact original finding',row)])
    ]);
}
function reviewViewFiles(review,capture){
  const files=reviewViewRows(capture?.files||state.preview?.files),
    reports=files.filter(file=>reviewViewReportNames.has(file.name)),
    originals=files.filter(file=>!reviewViewReportNames.has(file.name));
  const download=file=>button('Download',async()=>downloadResponse(
    await state.client.file(capture.id,file.name),file.name));
  const metadata=file=>[
    node('div',{},[node('strong',{},[file.name]),muted(file.role||file.type||'')]),
    Number.isSafeInteger(file.bytes)?file.bytes.toLocaleString()+' bytes':reviewViewText(file.bytes),
    code(file.sha256),capture?download(file):muted('Available after capture')
  ];
  return node('div',{},[
    node('h3',{},['Selected cohort reports']),
    muted(capture?'These files retain the exact selected-cohort review.':'Capture this reviewed handover to retain and download its files.'),
    reviewViewTable(['Report','Size','SHA-256','File'],reports,metadata),
    node('h3',{},['Complete private capture']),
    node('p',{},['The complete private archive includes the original receivables ledger and customer identities, original workshare sources, selected Xero cycle files and customer cash advice. The HTML and CSV reports above show the selected cohort.']),
    capture?node('div',{class:'actions'},[
      button('Download complete private archive',async()=>downloadResponse(
        await state.client.exportFile(capture.id,'handover.tar'),'commissioning-'+capture.id+'.tar'))
    ]):null,
    reviewViewDisclosure('Original private file inventory ('+originals.length+')',()=>
      reviewViewTable(['Original retained file','Size','SHA-256','File'],originals,metadata)),
    capture?muted('Saved capture '+capture.id+' · '+capture.fileCount+' retained files.'):null
  ]);
}
function renderReview(review,capture=null){
  const save=document.getElementById('capture'),draft=document.getElementById('review-as-draft'),
    baseline=document.getElementById('review-as-baseline');
  if(save)save.disabled=!state.preview||state.preview.previewSha256!==review?.previewSha256;
  if(draft)draft.hidden=!capture;if(baseline)baseline.hidden=!capture;
  if(!review){
    replace('review-title','Commissioning review');
    replace('review-meta',muted('Review a source cohort or open a saved handover.'));
    for(const id of ['review-summary','review-totals','review-projects','review-findings','review-changes','review-files'])replace(id);
    return;
  }
  const counts=review.counts||{};
  replace('review-title',capture?'Saved commissioning handover':'Commissioning review');
  replace('review-meta',review.label+' · Account date '+review.asOf+' · '+reviewViewText(review.source?.name));
  replace('review-summary',
    node('div',{class:'actions'},[tag(review.status),muted(capture?'Saved '+reviewViewText(capture.createdAt):'Original workspace revision '+review.revision)]),
    node('p',{},[review.summary]),
    node('div',{class:'metric-grid'},[
      ['Projects',counts.projects],['Milestones',counts.milestones],['Invoice line bindings',counts.invoiceLineBindings],
      ['Receipt portions',counts.receiptPortions],['Refund portions',counts.refundPortions],
      ['Items requiring review',counts.errors],['Warnings',counts.warnings]
    ].map(([label,value])=>node('div',{class:'metric'},[
      node('div',{class:'value'},[String(value??0)]),node('div',{class:'label'},[label])]))),
    reviewViewOriginal('Original review and source identity',{
      workspaceId:review.workspaceId,revision:review.revision,asOf:review.asOf,
      source:review.source,sourceFingerprint:review.sourceFingerprint,previewSha256:review.previewSha256,
      captureId:capture?.id??null,accountingRules:review.accountingRules
    }));
  replace('review-totals',...reviewViewRows(review.currencies).map(group=>node('section',{},[
    node('h3',{},['Cohort totals · '+group.currency.code+' · '+group.projects+' projects']),
    reviewViewTotals(group.totals||{},group.currency)
  ])));
  replace('review-projects',
    node('p',{class:'muted'},['Milestone balances use the selected original invoice, allocation and credit portions. Expand an invoice binding to see its complete original balance.']),
    reviewViewTable(['Project / customer','Currency','Source fee, net','Invoice net','Allocated cash','Amount due','Net recorded cash'],
      review.projects,project=>[
        node('div',{},[reviewViewIdentity(project.name,project.projectId),muted(project.customer?.name||'Choose original customer')]),
        project.currency.code,
        reviewViewMoney(project.totals.sourceFeeNet,project.currency),
        reviewViewMoney(project.totals.invoicedNet,project.currency),
        reviewViewMoney(project.totals.allocatedGross,project.currency),
        reviewViewMoney(project.totals.amountDueGross,project.currency),
        reviewViewMoney(project.totals.netRecordedCash,project.currency)
      ]),
    ...reviewViewRows(review.projects).map(reviewViewProject));
  replace('review-findings',reviewViewRows(review.findings).length?
    reviewViewFindings(review.findings):muted('No findings in this original review.'));
  replace('review-changes',review.baseline?node('div',{},[
    muted('Saved baseline '+review.baseline.captureId+' · Account date '+review.baseline.asOf),
    reviewViewRows(review.changes).length?
      reviewViewTable(['Change','Original identity','Before','After'],review.changes,row=>[
        reviewViewLabel(row.kind),code(row.key),reviewViewValue(row.before),reviewViewValue(row.after)
      ]):muted('No reported changes from the selected baseline.'),
    reviewViewOriginal('Original baseline identity',review.baseline)
  ]):muted('Choose an original saved capture as a baseline to compare source editions and amounts.'));
  replace('review-files',reviewViewFiles(review,capture));
}


async function downloadOriginalSource(){
  if(!state.source)throw new Error('Open an original source edition.');
  await downloadResponse(await state.client.sourceFile(state.source.id,'original-workshares.json'),state.source.name);
}
async function reviewAsDraft(){
  const capture=state.capture;
  if(!capture)throw new Error('Open a saved handover to reuse its original selection.');
  await selectSource(capture.sourceId,{selection:copy(capture.selection)});
  notice('The saved original selection is now an editable draft. Review the current account before capturing a new handover.');
}
async function reviewAsBaseline(){
  const capture=state.capture;
  if(!capture)throw new Error('Open a saved handover to choose its baseline.');
  if(!state.source||!state.selection)await selectSource(capture.sourceId,{selection:copy(capture.selection)});
  state.selection.baselineCaptureId=capture.id;renderBaselineOptions();changed();tab('matching');
  notice('Baseline selected: '+capture.label+' · '+capture.asOf+'. Review the current cohort at its chosen account date.');
}
async function currentConfiguration(){
  const response=await fetch('./config.json',{cache:'no-store',headers:{Accept:'application/json'}});
  if(!response.ok)throw new Error('The original commissioning service configuration could not be read ('+response.status+').');
  const config=await response.json();
  if(typeof config.workspaceId!=='string'||!config.workspaceId||typeof config.sourcesSha256!=='string'||
    !/^[a-f0-9]{64}$/.test(config.sourcesSha256)||!Number.isSafeInteger(config.revision)||
    !Number.isSafeInteger(config.sourceBytes)||!Number.isSafeInteger(config.requestBytes)){
    throw new Error('The service did not return its complete original workspace identity.');
  }
  for(const field of ['apiPath','uiPath','receivablesUiPath','xeroUiPath']){
    if(typeof config[field]!=='string'||!config[field].startsWith('/')||config[field].startsWith('//')||
      new URL(config[field],location.origin).origin!==location.origin){
      throw new Error('The service route must remain in the original local workspace.');
    }
  }
  if(state.config&&(config.workspaceId!==state.config.workspaceId||config.sourcesSha256!==state.config.sourcesSha256)){
    throw new Error('The local service now points to another accounting workspace. Keep the saved request or draft and reopen its original service.');
  }
  return config;
}
async function refreshRecords(){
  await retainDraft();const config=await currentConfiguration();state.config=config;revision(config);
  const captureId=state.capture?.id,sourceId=state.source?.id,selection=state.selection?copy(state.selection):null;
  state.previewToken=(state.previewToken??0)+1;state.preview=null;$('capture').disabled=true;clearInspection();
  await Promise.all([loadSources(),loadCaptures()]);
  if(sourceId)await selectSource(sourceId,{selection});
  if(captureId)await openCapture(captureId);
  notice('Original account records refreshed at revision '+state.revision+'.');
}
function on(id,event,work){
  $(id).addEventListener(event,eventValue=>{
    if(event==='submit')eventValue.preventDefault();
    void perform(()=>work(eventValue));
  });
}
function searchOnEnter(id,work){
  on(id,'keydown',async event=>{
    if(event.key==='Enter'){event.preventDefault();await work();}
  });
}
function bindEvents(){
  for(const entry of document.querySelectorAll('[data-tab]'))entry.addEventListener('click',()=>tab(entry.dataset.tab));
  on('actor','change',()=>saveLocal('actor',$('actor').value.trim()));
  on('refresh','click',refreshRecords);
  on('request-file','change',async event=>{
    const file=event.target.files[0];event.target.value='';
    if(file)await restoreRequest(file);
  });
  on('pending-find','click',findPending);
  on('pending-retry','click',executePending);
  on('pending-download','click',()=>{
    if(state.pending)downloadJson(state.pending,'commissioning-request-'+state.pending.body.requestId+'.json');
  });
  on('pending-retire','click',closeUnsaved);
  on('source-form','submit',inspectSource);
  on('source-import','click',importSource);
  for(const id of ['source-file','source-label','source-received','source-replaces','source-scales','source-expected'])
    on(id,id==='source-file'||id==='source-replaces'?'change':'input',clearInspection);
  on('source-search-button','click',()=>loadSources());
  searchOnEnter('source-search',()=>loadSources());
  on('source-more','click',()=>loadSources(true));
  on('capture-search-button','click',()=>loadCaptures());
  searchOnEnter('capture-search',()=>loadCaptures());
  on('capture-more','click',()=>loadCaptures(true));
  on('source-original','click',downloadOriginalSource);
  on('draft-download','click',downloadDraft);
  on('draft-file','change',async event=>{
    const file=event.target.files[0];event.target.value='';
    if(file)await loadDraft(file);
  });
  on('review-label','input',()=>{
    if(state.selection){state.selection.label=$('review-label').value;changed();}
  });
  on('as-of','change',async()=>{
    if(state.selection){
      state.selection.asOf=$('as-of').value;changed();await Promise.all([loadCustomers(),loadCandidates(0)]);
    }
  });
  on('baseline','change',()=>{
    if(state.selection){state.selection.baselineCaptureId=$('baseline').value||null;changed();}
  });
  on('project-search','input',renderProjectList);
  on('projects-all','click',()=>{
    if(state.selection){state.selection.projectIds=state.projects.map(row=>row.id);changed();}
  });
  on('projects-none','click',()=>{
    if(state.selection){state.selection.projectIds=[];changed();}
  });
  on('customer-search-button','click',()=>loadCustomers());
  searchOnEnter('customer-search',()=>loadCustomers());
  on('customer-select','change',async()=>{
    const control=projectControl();if(!control)return;
    const customerId=$('customer-select').value||null;
    if(customerId===control.customerId)return;
    control.customerId=customerId;changed();renderProjectEditor();await Promise.all([loadCustomers(),loadCandidates(0)]);
    notice('Original customer selected. The review will check every retained invoice, cash and credit binding against this customer.');
  });
  on('candidate-view','change',()=>loadCandidates(0));
  on('candidate-search-button','click',()=>loadCandidates(0));
  searchOnEnter('candidate-search',()=>loadCandidates(0));
  on('candidate-prev','click',()=>loadCandidates(Math.max(0,(state.candidate?.offset??0)-25)));
  on('candidate-next','click',()=>loadCandidates((state.candidate?.offset??0)+25));
  on('preview','click',previewSelection);
  on('capture','click',captureSelection);
  on('review-as-draft','click',reviewAsDraft);
  on('review-as-baseline','click',reviewAsBaseline);
}
async function boot(){
  if(!globalThis.crypto?.subtle||!globalThis.indexedDB)throw new Error('Open the original local service in a browser with secure request and draft storage.');
  state.config=await currentConfiguration();state.revision=state.config.revision;
  state.client=new CommissioningCollectionsClient({baseUrl:state.config.apiPath});
  state.scope=state.config.workspaceId+':'+state.config.sourcesSha256+':';
  $('receivables-link').href=state.config.receivablesUiPath+'/';
  $('xero-link').href=state.config.xeroUiPath+'/';
  renderConnection();bindEvents();
  const [savedActor,pending,lastSource]=await Promise.all([loadLocal('actor'),loadLocal('pending'),loadLocal('lastSource')]);
  if(typeof savedActor==='string')$('actor').value=savedActor;
  if(pending){
    ensureTarget(pending);
    if(pending.schema!=='stellar-forge.commissioning-browser-request.v1'||
      !['SOURCE_IMPORT','CAPTURE'].includes(pending.kind)||pending.intentSha256!==await intent(pending)){
      throw new Error('The retained browser request does not match its original operation identity. Preserve browser storage and load the original downloaded request.');
    }
    state.pending=pending;state.pendingAbsent=false;renderPending();
  }
  await Promise.all([loadSources(),loadCaptures()]);
  if(lastSource?.id){
    try{await selectSource(lastSource.id);}catch(error){
      notice('The previous source could not be reopened: '+String(error?.message??error)+'. Choose a retained source edition.',true);
    }
  }
  if(state.pending)await findPending();
  else if(!state.source)tab('sources');
}
void perform(boot);
