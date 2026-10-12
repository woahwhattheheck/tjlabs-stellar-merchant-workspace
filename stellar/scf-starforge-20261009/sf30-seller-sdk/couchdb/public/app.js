// MIT. One browser journal for the original saved CouchDB operator.
const $=id=>document.getElementById(id),all=selector=>[...document.querySelectorAll(selector)];
const json=value=>JSON.stringify(value,null,2),parse=id=>JSON.parse($(id).value);
const canonical=value=>JSON.stringify(sort(value));
function sort(value){if(Array.isArray(value))return value.map(sort);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,sort(value[key])]));return value;}
const sha=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(v=>v.toString(16).padStart(2,'0')).join('');
const token=location.hash.slice(1);let info,db,busy=true,generation=0,documentGeneration=0,archiveGeneration=0;
let selectedCapture=null,fieldInventory=null,fieldRows=[],fieldLimit=150,selectedProduct=null,selectedDeployment=null,reviewedDeployment=null,exported=null,comparison=null;
const pages=new Map(),pending=new Map();
const report=(text,error=false)=>{$('status').textContent=text;$('status').dataset.error=String(error);};
const show=(id,value)=>{$(id).textContent=typeof value==='string'?value:json(value);};
function controls(){all('main button, main input, main select, main textarea, #refresh').forEach(element=>{element.disabled=busy&&!element.dataset.always;});$('export-download').disabled=busy||!exported;}
function panel(name){all('.panel').forEach(value=>{value.hidden=value.id!==name;});all('nav button').forEach(value=>{value.setAttribute('aria-current',String(value.dataset.panel===name));});}
all('nav button').forEach(button=>button.addEventListener('click',()=>panel(button.dataset.panel)));
function transaction(mode,fn){return new Promise((done,fail)=>{const tx=db.transaction('records',mode),store=tx.objectStore('records');let result;try{result=fn(store);}catch(error){tx.abort();fail(error);return;}tx.oncomplete=()=>done(result?.result);tx.onerror=()=>fail(tx.error);tx.onabort=()=>fail(tx.error??new Error('The browser journal was interrupted.'));});}
const put=(key,value)=>transaction('readwrite',s=>s.put(value,key));
const get=key=>transaction('readonly',s=>s.get(key));
const remove=key=>transaction('readwrite',s=>s.delete(key));
async function api(path,body,{method=body===undefined?'GET':'POST',rawBody,headers={}}={}){
  const response=await fetch(path,{method,headers:{'x-workspace-token':token,'x-couchdb-workspace-id':info?.workspaceId??$('workspace-label').dataset.id??'',
    ...(body!==undefined||rawBody!==undefined?{'content-type':'application/json'}:{}),...headers},body:rawBody??(body===undefined?undefined:JSON.stringify(body)),redirect:'error'});
  let value;try{value=await response.json();}catch{throw new Error('The original reply was interrupted. Reopen this saved operation.');}
  if(info&&(value.workspaceId!==info.workspaceId||value.instanceId!==info.instanceId))throw new Error('The workspace listener changed. Reopen its current private address.');
  if(!response.ok){const error=new Error(value.data?.error?.message??'HTTP '+response.status);error.code=value.data?.error?.code;error.status=response.status;throw error;}
  return value.data;
}
const query=(name,input={})=>api('/api/query',{name,input});
async function perform(fn){
  if(busy)return;busy=true;controls();
  try{return await fn();}catch(error){report((error.code?error.code+': ':'')+error.message,true);}
  finally{busy=false;controls();}
}
const on=(id,fn)=>$(id).addEventListener('click',()=>perform(fn));
function option(select,value,label){const key=String(value),existing=[...select.options].find(item=>item.value===key);if(existing){existing.textContent=label;return existing;}const item=document.createElement('option');item.value=key;item.textContent=label;select.append(item);return item;}
function summary(value){if(!value)return '';return value.title??value.label??value.id??value.exportId??'';}
async function list(name,selectId,moreId,{append=false,label=summary}={}){
  const prior=$(selectId).value,priorLabel=[...$(selectId).options].find(item=>item.value===prior)?.textContent,page=await query(name,{limit:50,...(append&&pages.get(selectId)?{after:pages.get(selectId)}:{})});
  if(!append)$(selectId).replaceChildren();
  for(const value of page.items){const item=option($(selectId),value.id??value.exportId,(label(value)||value.id||value.exportId)+' '+(value.state??''));item.dataset.state=value.state??'COMPLETE';}
  if(prior&&priorLabel&&!append&&![...$(selectId).options].some(v=>v.value===prior))option($(selectId),prior,priorLabel);
  if([...$(selectId).options].some(v=>v.value===prior))$(selectId).value=prior;
  pages.set(selectId,page.nextCursor);$(moreId).hidden=!page.nextCursor;return page;
}
async function listCaptures(append=false){
  await list('captures','captures','captures-more',{append,label:value=>value.id+' · '+(value.counts?.activeDocuments??value.state??'')+' documents'});
  for(const name of ['base-capture','compare-left']){
    const prior=$(name).value;$(name).replaceChildren();option($(name),'',name==='base-capture'?'Initial capture':'Choose prior edition');
    for(const item of $('captures').options)option($(name),item.value,item.textContent);
    if([...$(name).options].some(v=>v.value===prior))$(name).value=prior;
  }
}
async function refresh(){
  await list('connections','connections','connections-more',{label:v=>v.connection.database+' · '+v.connection.baseUrl+' · '+v.id.slice(0,12)});
  await listCaptures();
  await list('mappings','mappings','mappings-more');
  await list('products','products','products-more');
  if($('captures').value&&selectedCapture?.id!==$('captures').value)await captureSelect($('captures').value);
  if($('products').value)await productSelect($('products').value);
  await history(false);
  report('Original workspace state refreshed.');
}
async function captureSelect(id,{offset=0,append=false}={}){
  if(!id)return;
  if($('captures').selectedOptions[0]?.dataset.state==='INCOMPLETE'){
    generation++;documentGeneration++;selectedCapture=null;fieldInventory=null;fieldRows=[];$('fields').replaceChildren();$('documents').replaceChildren();$('attachments').replaceChildren();$('document').textContent='';
    $('mapping-origin').textContent='The selected capture is incomplete.';show('capture-summary',{id,state:'INCOMPLETE',continuation:'Open its original saved operation below or in Operations, then resume the same request.'});return;
  }
  const mine=++generation,current=await query('capture',{id,offset,limit:100});
  if(mine!==generation)return;
  if(!append){selectedCapture=current;fieldInventory=null;fieldRows=[];fieldLimit=150;$('fields').replaceChildren();$('mapping-origin').textContent='Capture '+id+' · '+current.manifestSha256;$('documents').replaceChildren();$('document').textContent='';$('attachments').replaceChildren();documentGeneration++;}
  selectedCapture={...current,items:append?[...(selectedCapture?.items??[]),...current.items]:current.items};$('captures').value=id;show('capture-summary',{...current,items:undefined});
  for(const row of current.items)option($('documents'),row.id,row.id+' · '+row.status+' · '+(row.revision??''));
  $('documents-more').hidden=current.nextOffset===null;pages.set('documents',current.nextOffset);
  if(!append&&$('documents').value)await documentSelect();
}
async function documentSelect(){
  if(!selectedCapture||!$('documents').value)return;
  const captureId=selectedCapture.id,documentId=$('documents').value,mine=++documentGeneration,result=await query('document',{captureId,documentId});
  if(mine!==documentGeneration||selectedCapture?.id!==captureId||$('documents').value!==documentId)return;
  show('document',{record:result.document,bodySha256:result.bodySha256,bytes:result.bytes,...(result.json===null?{json:null}:{json:result.json.slice(0,262144),displayTruncated:result.json.length>262144})});
  $('attachments').replaceChildren();
  for(const attachment of result.document.attachments??[]){
    const button=document.createElement('button'),name=attachment.name;
    if(!name)continue;button.textContent='Download attachment: '+name;button.addEventListener('click',()=>perform(()=>download('attachment',{captureId,documentId,name})));$('attachments').append(button);
  }
}
async function download(kind,input){
  const url='/api/file?'+new URLSearchParams({kind,input:JSON.stringify(input)});
  const response=await fetch(url,{headers:{'x-workspace-token':token,'x-couchdb-workspace-id':info.workspaceId},redirect:'error'});
  if(!response.ok){const result=await response.json();throw new Error(result.data?.error?.message??'Download failed.');}
  const blob=await response.blob(),href=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=href;a.download=/filename="([^"]+)"/.exec(response.headers.get('content-disposition')??'')?.[1]??'download';a.click();setTimeout(()=>URL.revokeObjectURL(href),30000);
}
function renderPending(){
  $('pending').replaceChildren();
  for(const item of pending.values()){
    const row=document.createElement('div');row.className='pending-row';
    const description=document.createElement('p');description.textContent=item.command+' · '+item.id+' · '+(item.lastState??'SAVED');row.append(description);
    const inspect=document.createElement('button');inspect.textContent='Read original outcome';inspect.dataset.always='true';
    inspect.onclick=()=>reconcile(item).catch(error=>report(error.message,true));row.append(inspect);
    const resume=document.createElement('button');resume.textContent='Resume saved request';resume.dataset.always='true';
    resume.onclick=()=>perform(async()=>{await api('/api/resume',{id:item.id});await monitor(item);});row.append(resume);
    const cancel=document.createElement('button');cancel.textContent='Interrupt current operation';cancel.dataset.always='true';
    cancel.onclick=()=>api('/api/cancel',{id:item.id}).then(v=>report(json(v))).catch(error=>report(error.message,true));row.append(cancel);
    const resend=document.createElement('button');resend.textContent='Resend exact saved body';resend.dataset.always='true';
    resend.onclick=()=>perform(()=>submit(item));row.append(resend);
    $('pending').append(row);
  }
}
async function reconcile(item,{full=true}={}){
  let state=await query('operation',{id:item.id,includeResult:full});
  if(!full&&['COMPLETE','FAILED','INTERRUPTED'].includes(state.state))state=await query('operation',{id:item.id,includeResult:true});
  if(state.id!==item.id||state.command!==item.command||state.requestSha256!==item.requestSha256)throw new Error('The original operation identity changed.');
  if(item.lastState!==state.state){item.lastState=state.state;await put('pending:'+info.workspaceId+':'+item.id,item);}
  show('operation-detail',state);
  if(state.state==='COMPLETE'){pending.delete(item.id);await remove('pending:'+info.workspaceId+':'+item.id);}
  renderPending();return state;
}
async function monitor(item){
  for(;;){
    const state=await reconcile(item,{full:false});
    if(['COMPLETE','FAILED','INTERRUPTED'].includes(state.state)){report(item.command+' · '+state.state+' · '+item.id,state.state!=='COMPLETE');return state;}
    report(item.command+' · '+state.state+' · '+item.id);await new Promise(done=>setTimeout(done,800));
  }
}
async function submit(item){
  try{
    const accepted=await api('/api/action',undefined,{method:'POST',rawBody:item.body});
    if(accepted.id!==item.id||accepted.command!==item.command||accepted.requestSha256!==item.requestSha256)throw new Error('The saved request acceptance changed.');
    return monitor(item);
  }catch(error){
    try{const known=await reconcile(item);if(known.state==='COMPLETE')return known;}catch(readError){if(readError.status===404)item.lastState='NOT_YET_RETAINED';}
    await put('pending:'+info.workspaceId+':'+item.id,item);renderPending();throw error;
  }
}
async function run(command,input){
  const id=crypto.randomUUID(),request={schema:'stellar-forge.couchdb-operation.v1',workspaceId:info.workspaceId,id,command,input};
  const item={id,command,requestSha256:await sha(canonical(request)),body:JSON.stringify({workspaceId:info.workspaceId,id,command,input}),lastState:'SAVED'};
  await put('pending:'+info.workspaceId+':'+id,item);pending.set(id,item);renderPending();
  const result=await submit(item);
  if(result.state!=='COMPLETE')throw Object.assign(new Error(result.error?.message??'Read and resume the original saved operation.'),{code:result.error?.code});
  return result;
}
function fieldType(field){return Object.keys(field.kinds).every(k=>k==='boolean'||k==='null')?'boolean':'string';}
function buildFields(inventory){
  fieldInventory=inventory;fieldRows=inventory.fields.map((field,index)=>{
    let alias=field.pointer.split('/').at(-1).replaceAll('~1','_').replaceAll('~0','_').replace(/[^A-Za-z0-9_]/g,'_');
    if(!/^[A-Za-z]/.test(alias)||alias.length>40)alias='field_'+index;
    return {field,use:field.pointer==='/_id'||field.pointer==='/_rev',alias,type:fieldType(field),
      encoding:Object.keys(field.kinds).some(k=>['array','object'].includes(k))?'json':field.kinds.number?'decimal':'value',nullable:false,missing:'error',empty:'preserve'};
  });renderFields();
}
function renderFields(){
  $('fields').replaceChildren();
  for(const value of fieldRows.slice(0,fieldLimit)){
    const row=document.createElement('tr');
    const cell=content=>{const td=document.createElement('td');typeof content==='string'?td.textContent=content:td.append(content);row.append(td);return td;};
    const check=document.createElement('input');check.type='checkbox';check.checked=value.use;check.onchange=()=>{value.use=check.checked;};cell(check);
    cell(value.field.pointer||'(whole document)');cell(Object.entries(value.field.kinds).map(([kind,count])=>kind+': '+count).join(', ')+' / '+value.field.missing);
    const alias=document.createElement('input');alias.value=value.alias;alias.oninput=()=>{value.alias=alias.value;};cell(alias);
    const select=(items,current,change)=>{const control=document.createElement('select');for(const item of items)option(control,item,item);control.value=current;control.onchange=()=>change(control.value);cell(control);return control;};
    const type=select(['string','integer','number','boolean'],value.type,v=>{value.type=v;});
    select(['value','json','decimal'],value.encoding,v=>{value.encoding=v;if(v!=='value'){value.type='string';type.value='string';}});
    const nullable=document.createElement('input');nullable.type='checkbox';nullable.checked=value.nullable;nullable.onchange=()=>{value.nullable=nullable.checked;};cell(nullable);
    select(['error','null'],value.missing,v=>{value.missing=v;});
    select(['preserve','null'],value.empty,v=>{value.empty=v;});$('fields').append(row);
  }
  $('fields-more').hidden=fieldLimit>=fieldRows.length;controls();
}
function composeMapping(){
  if(!selectedCapture||fieldInventory?.manifestSha256!==selectedCapture.manifestSha256)throw new Error('Inspect fields from the selected original capture.');
  const columns={};
  for(const row of fieldRows.filter(v=>v.use)){if(Object.hasOwn(columns,row.alias))throw new Error('Public field names must be unique.');Object.defineProperty(columns,row.alias,{enumerable:true,value:{pointer:row.field.pointer,type:row.type,encoding:row.encoding,nullable:row.nullable,missing:row.missing,empty:row.empty}});}
  const review={reviewer:$('reviewer').value,note:$('review-note').value};for(const flag of ['allowConflicts','allowMissing','allowDeletions','allowConcurrentChanges'])review[flag]=$(flag).checked;
  $('mapping-json').value=json({captureId:selectedCapture.id,expectedCaptureSha256:selectedCapture.manifestSha256,title:$('mapping-title').value,queries:{[$('query-name').value]:{columns,review}}});return saveDraft();
}
async function productSelect(id){
  if(!id)return;const value=await query('product',{id});if($('products').value!==id)return;selectedProduct=value;show('product-state',value);await publisherRefresh();
}
async function publisherRefresh({plansOffset=0,runsOffset=0,appendPlans=false,appendRuns=false}={}){
  if(!selectedProduct)return;const productId=selectedProduct.id,result=await query('publisher.status',{productId,limit:50,plansOffset,runsOffset});
  if(selectedProduct?.id!==productId)return;
  const plan=$('plans').value,runId=$('runs').value;
  if(!appendPlans)$('plans').replaceChildren();if(!appendRuns)$('runs').replaceChildren();
  for(const value of result.plans)if(![...$('plans').options].some(v=>v.value===String(value.id)))option($('plans'),String(value.id),value.id+' · '+value.data.title);
  for(const value of result.runs)if(![...$('runs').options].some(v=>v.value===value.id))option($('runs'),value.id,value.id+' · '+value.state);
  if([...$('plans').options].some(v=>v.value===plan))$('plans').value=plan;if([...$('runs').options].some(v=>v.value===runId))$('runs').value=runId;
  pages.set('plans',result.pages.plans.next);pages.set('runs',result.pages.runs.next);$('plans-more').hidden=result.pages.plans.next===null;$('runs-more').hidden=result.pages.runs.next===null;show('publisher-state',result);
}
function productId(){if(!selectedProduct||$('products').value!==selectedProduct.id)throw new Error('Open the selected original product.');return selectedProduct.id;}
const runId=()=>{if(!$('runs').value)throw new Error('Select an original publisher run.');return $('runs').value;};
async function inspectRun(){const result=await query('publisher.inspect',{productId:productId(),runId:runId()});show('publisher-state',result);return result;}
async function deploymentInspect(){const id=$('deployment-id').value.trim(),value=await query('deployment',{id});if($('deployment-id').value.trim()!==id)return;selectedDeployment={id,...value};show('deployment',value);return value;}
async function history(append=false){
  const page=await query('operations',{limit:50,...(append&&pages.get('history')?{after:pages.get('history')}:{})});if(!append)$('history').replaceChildren();
  for(const item of page.items){const row=document.createElement('tr');for(const text of [item.id,item.command,item.state]){const td=document.createElement('td');td.textContent=text;row.append(td);}
    const td=document.createElement('td'),button=document.createElement('button');button.textContent='Inspect';button.onclick=()=>perform(async()=>show('operation-detail',await query('operation',{id:item.id})));td.append(button);row.append(td);$('history').append(row);}
  pages.set('history',page.nextCursor);$('operations-more').hidden=!page.nextCursor;controls();
}
const draftFields=['connection-label','connection-json','mapping-title','query-name','reviewer','review-note','mapping-json','product-title','plan-json','publication-review','terms','deployment-id','release-id','runtime','archive-sha','receive-directory','command-input'];
async function saveDraft(){if(!db||!info)return;const values=Object.fromEntries(draftFields.map(id=>[id,$(id).value]));await put('draft:'+info.workspaceId,{values});}
for(const id of draftFields)$(id).addEventListener('input',()=>{if(id==='terms')reviewedDeployment=null;saveDraft().catch(error=>report(error.message,true));});
$('archive-file').addEventListener('change',()=>{archiveGeneration++;});
$('captures').addEventListener('change',()=>perform(()=>captureSelect($('captures').value)));
$('documents').addEventListener('change',()=>perform(documentSelect));
$('products').addEventListener('change',()=>perform(()=>productSelect($('products').value)));
on('refresh',refresh);
on('connections-more',()=>list('connections','connections','connections-more',{append:true,label:v=>v.connection.database+' · '+v.id.slice(0,12)}));
on('captures-more',()=>listCaptures(true));
on('mappings-more',()=>list('mappings','mappings','mappings-more',{append:true}));
on('products-more',()=>list('products','products','products-more',{append:true}));
on('connection-save',async()=>{const result=await run('connection.save',{label:$('connection-label').value,connection:parse('connection-json')});await refresh();$('connections').value=result.value.id;});
on('capture-run',async()=>{const result=await run('capture',{connectionId:$('connections').value,...($('base-capture').value?{baseCaptureId:$('base-capture').value}:{})});await listCaptures();option($('captures'),result.value.id,result.value.id);$('captures').value=result.value.id;await captureSelect(result.value.id);});
on('capture-fields',async()=>{if(!selectedCapture||selectedCapture.id!==$('captures').value)throw new Error('Open the selected complete original capture.');const result=await run('capture.fields',{captureId:selectedCapture.id});if(result.value.manifestSha256!==selectedCapture.manifestSha256)throw new Error('The selected capture changed.');buildFields(result.value);panel('mapping');});
on('capture-manifest',()=>download('capture',{id:selectedCapture?.id}));
on('document-download',()=>download('document',{captureId:selectedCapture?.id,documentId:$('documents').value}));
on('documents-more',()=>captureSelect(selectedCapture.id,{offset:pages.get('documents'),append:true}));
on('fields-more',()=>{fieldLimit+=150;renderFields();});
on('mapping-compose',composeMapping);
on('mapping-save',async()=>{const input=parse('mapping-json');if(input.captureId!==selectedCapture?.id||input.expectedCaptureSha256!==selectedCapture.manifestSha256)throw new Error('Review this mapping against the selected original capture.');const result=await run('mapping.save',input);await list('mappings','mappings','mappings-more');option($('mappings'),result.value.id,result.value.title);$('mappings').value=result.value.id;panel('publication');});
on('product-create',async()=>{const result=await run('product.create',{title:$('product-title').value,mappingId:$('mappings').value});await list('products','products','products-more');option($('products'),result.value.id,result.value.title);$('products').value=result.value.id;await productSelect(result.value.id);});
on('product-select',async()=>{const result=await run('product.select',{productId:productId(),mappingId:$('mappings').value,expectedRevision:selectedProduct.selection.revision});selectedProduct=result.value;show('product-state',selectedProduct);await publisherRefresh();});
on('plan-compose',async()=>{
  const current=await query('product',{id:productId()}),mapping=await query('mapping',{id:current.selection.mappingId}),name=Object.keys(mapping.source.queries)[0],queryValue=mapping.source.queries[name];
  const columns=Object.fromEntries(Object.entries(queryValue.projection).map(([key,value])=>[key,{type:value.type,nullable:value.nullable}]));
  $('plan-json').value=json({title:current.title,query:name,input:{},sourceHash:current.selection.sourceHash,dataset:{name:'documents',columns,filters:[],ranges:[],sorts:[],defaultLimit:50,maxLimit:250,maxPageBytes:921600},
    extraction:{maxRows:250000,maxBytes:67108864,maxRowBytes:1048576,timeoutMs:300000,order:[{column:Object.keys(columns)[0],direction:'asc'}]}});await saveDraft();
});
on('plan-save',async()=>{await run('publisher.plan',{productId:productId(),plan:parse('plan-json')});await publisherRefresh();});
on('extract',async()=>{const result=await run('publisher.extract',{productId:productId(),planId:Number($('plans').value)});await publisherRefresh();$('runs').value=result.value.id;await inspectRun();});
on('plans-more',()=>publisherRefresh({plansOffset:pages.get('plans'),appendPlans:true,appendRuns:true}));
on('runs-more',()=>publisherRefresh({runsOffset:pages.get('runs'),appendPlans:true,appendRuns:true}));
on('run-inspect',inspectRun);
on('publisher-target',async()=>show('publisher-state',await query('publisher.target',{productId:productId()})));
on('run-recover',async()=>{await run('publisher.recover',{productId:productId(),runId:runId()});await publisherRefresh();});
on('review-publication',async()=>{const current=await inspectRun();await run('publisher.review',{productId:productId(),runId:runId(),expectedCandidateDigest:current.run.data.candidate.candidateDigest,review:parse('publication-review')});await inspectRun();});
on('publish',async()=>{const current=await inspectRun();await run('publisher.publish',{productId:productId(),runId:runId(),reviewId:current.run.data.review.id});await publisherRefresh();});
function deploymentInput(){return {productId:productId(),runId:runId(),terms:parse('terms')};}
on('deployment-review',async()=>{const input=deploymentInput(),result=await run('deployment.review',input);reviewedDeployment={input:canonical(input),value:result.value};show('deployment-review-value',result.value);});
on('deployment-prepare',async()=>{const input=deploymentInput();if(reviewedDeployment?.input!==canonical(input))throw new Error('Review the current complete deployment and merchant terms.');const result=await run('deployment.prepare',{...input,expectedReviewSha256:reviewedDeployment.value.reviewSha256});$('deployment-id').value=result.id;await saveDraft();await deploymentInspect();});
on('deployment-inspect',deploymentInspect);
on('release-stage',async()=>{const value=await deploymentInspect();const result=await run('release.stage',{deploymentId:$('deployment-id').value.trim(),expectedSourceSha256:value.sourceSha256,releaseId:$('release-id').value.trim(),runtime:parse('runtime')});show('release-state',result.value);});
on('deployment-rebind',async()=>{const value=await deploymentInspect(),result=await run('deployment.rebind',{productId:productId(),deploymentId:$('deployment-id').value.trim(),expectedSourceSha256:value.sourceSha256,expectedExecutionSha256:value.dataset.executionSha256});$('deployment-id').value=result.id;await saveDraft();await deploymentInspect();});
on('release-open',async()=>{const result=await run('release.console.open',{});$('release-link').href=result.value.url;$('release-link').hidden=false;show('release-state',result.value);});
on('release-status',async()=>{const result=await query('release.status');show('release-state',result);if(result.url){$('release-link').href=result.url;$('release-link').hidden=false;}});
on('clients-refresh',()=>list('clients','clients','clients-more',{label:v=>v.exportId+' · '+(v.state??'')}));
on('clients-more',()=>list('clients','clients','clients-more',{append:true,label:v=>v.exportId}));
on('client-inspect',async()=>show('client-state',await query('client.manifest',{exportId:$('clients').value})));
on('project-export',async()=>{const result=await run('project.export',{});exported={id:result.id,...result.value};show('export-state',exported);controls();});
on('export-download',()=>download('export',{id:exported.id}));
on('project-receive',async()=>{
  const file=$('archive-file').files[0],sha256=$('archive-sha').value.trim(),directory=$('receive-directory').value.trim(),mine=archiveGeneration;
  if(!file||!/^[a-f0-9]{64}$/.test(sha256)||!directory.startsWith('/'))throw new Error('Choose the complete ZIP, its original SHA-256, and a new private host directory.');
  const key='upload:'+info.workspaceId+':'+sha256+':'+file.size;let record=await get(key);
  if(!record){record={id:crypto.randomUUID(),sha256,bytes:file.size,name:file.name};await put(key,record);}
  let state=await api('/api/upload?'+new URLSearchParams({id:record.id}));
  if(mine!==archiveGeneration||$('archive-sha').value.trim()!==sha256)throw new Error('The selected source archive changed.');
  if(state.state!=='COMPLETE'){
    if(state.sha256&&state.sha256!==sha256)throw new Error('The original upload identity changed.');
    const response=await fetch('/api/upload?'+new URLSearchParams({id:record.id,sha256,bytes:String(file.size),offset:String(state.offset)}),{method:'PUT',
      headers:{'x-workspace-token':token,'x-couchdb-workspace-id':info.workspaceId},body:file.slice(state.offset),redirect:'error'});
    const value=await response.json();if(value.workspaceId!==info.workspaceId||value.instanceId!==info.instanceId||!response.ok)throw new Error(value.data?.error?.message??'The source upload was interrupted; reuse this file to continue at its saved offset.');state=value.data;
  }
  if(mine!==archiveGeneration||$('archive-sha').value.trim()!==sha256||$('receive-directory').value.trim()!==directory)throw new Error('The receiving selection changed.');
  if(state.state!=='COMPLETE'||state.sha256!==sha256||state.bytes!==file.size)throw new Error('The original uploaded archive is incomplete.');
  const result=await run('project.receive',{file:state.file,expectedSha256:sha256,directory});show('receive-state',result.value);
});
on('compare-captures',async()=>{if(!selectedCapture)throw new Error('Select the later original capture.');comparison={left:$('compare-left').value,right:selectedCapture.id,offset:0};const result=await query('compare',comparison);show('comparison',result);comparison.offset=result.nextOffset;$('comparison-more').hidden=result.nextOffset===null;});
on('comparison-more',async()=>{const result=await query('compare',comparison);show('comparison',result);comparison.offset=result.nextOffset;$('comparison-more').hidden=result.nextOffset===null;});
on('operations-refresh',()=>history(false));on('operations-more',()=>history(true));on('command-run',async()=>{const result=await run($('command').value,parse('command-input'));show('operation-detail',result);});
async function boot(){
  if(!/^[a-f0-9]{64}$/.test(token))throw new Error('Open the original private workspace address printed by the server or Applications.');
  info=await api('/api/info');
  if(info.schema!=='stellar-forge.couchdb-workspace.v1'||!/^[a-f0-9-]{36}$/.test(info.workspaceId??''))throw new Error('The original workspace identity could not be read.');
  $('workspace-label').textContent=info.workspaceId;$('identity').textContent=info.directory+' · '+info.workspaceIdentitySha256+' · '+info.instanceId;
  db=await new Promise((done,fail)=>{const request=indexedDB.open('couchdb-original-workspace',1);request.onupgradeneeded=()=>request.result.createObjectStore('records');request.onsuccess=()=>done(request.result);request.onerror=()=>fail(request.error);});
  $('connection-json').value=json({schema:'stellar-forge.couchdb-connection.v1',baseUrl:'http://127.0.0.1:5984',database:'documents',auth:{kind:'basic',usernameEnv:'COUCHDB_USER',passwordEnv:'COUCHDB_PASSWORD'},selection:{kind:'ids',ids:[]},attachments:{mode:'none'}});
  $('terms').value=json({origin:'',path:'/documents',payment:{}});
  const draft=await get('draft:'+info.workspaceId);for(const [id,value] of Object.entries(draft?.values??{}))if(draftFields.includes(id)&&typeof value==='string')$(id).value=value;
  const records=await transaction('readonly',store=>store.getAll());for(const item of records??[])if(item?.id&&item?.body&&item?.requestSha256){let parsed;try{parsed=JSON.parse(item.body);}catch{continue;}if(parsed.workspaceId===info.workspaceId)pending.set(item.id,item);}
  for(const command of info.commands)option($('command'),command,command);
  renderPending();await refresh();panel('source');
}
boot().then(()=>{busy=false;controls();}).catch(error=>{report(error.message,true);if(info&&db){busy=false;controls();renderPending();}});
