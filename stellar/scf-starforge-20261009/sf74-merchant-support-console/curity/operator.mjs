// MIT. Readable Curity operator over the existing SF74 private workspace.
const $=id=>document.getElementById(id),state={identity:null,catalog:null,edition:null,case:null,operation:null,manifest:null,
 page:'events',after:0,next:null,generation:0,selection:new Map(),decisions:new Map(),pending:null,busy:false};
const DB='sf74-curity-operator-v1',STORE='custody';
const uuid=prefix=>prefix+'-'+crypto.randomUUID(),clone=x=>structuredClone(x);
const hash=async data=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(x=>x.toString(16).padStart(2,'0')).join('');
// SHA-256 over bounded file slices; original gigabyte exports never need one giant browser buffer.
async function hashFile(file){
 const k=new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
 0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,
 0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,
 0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,
 0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
 0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,
 0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
 const h=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
 const w=new Uint32Array(64),r=(x,n)=>(x>>>n)|(x<<(32-n));
 function block(data,offset){
  const view=new DataView(data.buffer,data.byteOffset+offset,64);
  for(let i=0;i<16;i++)w[i]=view.getUint32(i*4,false);
  for(let i=16;i<64;i++){const x=w[i-15],y=w[i-2];w[i]=(w[i-16]+(r(x,7)^r(x,18)^(x>>>3))+w[i-7]+(r(y,17)^r(y,19)^(y>>>10)))>>>0;}
  let [a,b,c,d,e,f,g,j]=h;
  for(let i=0;i<64;i++){
   const t1=(j+(r(e,6)^r(e,11)^r(e,25))+((e&f)^(~e&g))+k[i]+w[i])>>>0;
   const t2=((r(a,2)^r(a,13)^r(a,22))+((a&b)^(a&c)^(b&c)))>>>0;
   j=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;
  }
  for(const [i,x] of [a,b,c,d,e,f,g,j].entries())h[i]=(h[i]+x)>>>0;
 }
 let tail=new Uint8Array(0);
 for(let offset=0;offset<file.size;offset+=1024*1024){
  const chunk=new Uint8Array(await file.slice(offset,Math.min(file.size,offset+1024*1024)).arrayBuffer());
  if(chunk.length!==Math.min(1024*1024,file.size-offset))throw new Error('The selected original file changed while hashing.');
  const data=new Uint8Array(tail.length+chunk.length);data.set(tail);data.set(chunk,tail.length);
  const complete=data.length-data.length%64;for(let at=0;at<complete;at+=64)block(data,at);tail=data.slice(complete);
 }
 const end=new Uint8Array(tail.length<56?64:128);end.set(tail);end[tail.length]=0x80;
 const bits=BigInt(file.size)*8n,view=new DataView(end.buffer);view.setUint32(end.length-8,Number(bits>>32n),false);view.setUint32(end.length-4,Number(bits&0xffffffffn),false);
 for(let at=0;at<end.length;at+=64)block(end,at);
 return [...h].map(x=>x.toString(16).padStart(8,'0')).join('');
}

const display=value=>typeof value==='string'?value:JSON.stringify(value,null,2);
function el(tag,text,className){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;}
function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('error',error);}
function fail(message){throw new Error(message);}
function key(suffix){if(!state.identity)fail('Open the original workspace first.');return location.origin+'|'+state.identity+'|'+suffix;}
async function database(){return new Promise((done,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE);r.onerror=()=>reject(r.error);r.onsuccess=()=>done(r.result);});}
async function saved(suffix,value,write=false,expected=undefined){
 const db=await database();try{return await new Promise((done,reject)=>{const t=db.transaction(STORE,write?'readwrite':'readonly'),s=t.objectStore(STORE);let result,error;
 const r=s.get(key(suffix));r.onsuccess=()=>{result=r.result??null;
  if(write){if(expected!==undefined&&(result?.id??null)!==expected){error=new Error('Another tab changed this saved action. Reopen the current workspace.');t.abort();return;}
   if(value===null)s.delete(key(suffix));else s.put(value,key(suffix));result=value;
  }};t.oncomplete=()=>done(result);t.onerror=()=>reject(error??t.error??r.error);t.onabort=()=>reject(error??t.error);
 });}finally{db.close();}
}
function pendingView(){$('pending').hidden=!state.pending;$('pending-description').textContent=state.pending?
 state.pending.path+' · '+state.pending.id+(state.pending.error?' · '+state.pending.error.message:''):'';}
async function request(path,{body,method=body===undefined?'GET':'POST',raw=false,signal}={}){
 const u=new URL(path,location.origin);if(u.origin!==location.origin||!u.pathname.startsWith('/api/'))fail('Use this original workspace API.');
 const binary=body instanceof Blob;let response;
 try{response=await fetch(u,{method,body:body===undefined?undefined:binary?body:JSON.stringify(body),
 headers:body===undefined||binary?{}:{'content-type':'application/json'},cache:'no-store',credentials:'same-origin',redirect:'error',signal});}
 catch(e){throw Object.assign(new Error('No readable response. Keep this saved action and retry its same identity. '+e.message),{uncertain:true});}
 if(state.identity&&u.pathname.startsWith('/api/curity/')&&response.headers.get('x-curity-workspace')!==state.identity)
  throw Object.assign(new Error('The responding Curity workspace changed.'),{uncertain:true});
 if(raw&&response.ok)return response;
 let result;try{result=await response.json();}catch{throw Object.assign(new Error('The original response is unreadable; reconcile the same action.'),{uncertain:true});}
 if(!response.ok)throw Object.assign(new Error(result.message??result.detail??result.error??'The operation failed.'),{status:response.status,code:result.error});
 return result;
}
async function sendSaved(){
 const original=state.pending;if(!original)fail('No saved action is pending.');
 let result;
 try{result=await request(original.path,{body:original.body});}
 catch(error){
  try{state.pending=await saved('pending',{...original,error:{message:error.message,status:error.status??0,code:error.code??null}},true,original.id);}
  catch(custody){state.pending=await saved('pending');pendingView();throw custody;}
  pendingView();throw error;
 }
 // Receipt persistence cannot reinterpret a completed HTTP response as an
 // uncertain provider request or overwrite a newer pending operation.
 await saved('history-'+original.id,{...original,result},true);
 await saved('pending',null,true,original.id);state.pending=null;pendingView();return result;
}
async function act(path,body){
 if(state.pending)fail('Receive the saved original action before preparing another one.');
 const item={id:uuid('http'),path,body:clone(body),createdAt:new Date().toISOString()};
 await saved('pending',item,true,null);state.pending=item;pendingView();return sendSaved();
}
async function task(work){
 if(state.busy)return;state.busy=true;
 try{await work();}catch(error){status(error.message,true);}finally{state.busy=false;}
}
function optionList(node,rows,current,label){
 node.replaceChildren(new Option('Choose…',''));for(const row of rows)node.add(new Option(label(row),row.id));
 if(rows.some(row=>row.id===current))node.value=current;
}
async function refresh(){
 const current=await request('/api/curity/state');
 if(state.identity&&current.identity!==state.identity)fail('The workspace identity changed.');
 state.identity=current.identity;state.catalog=current;
 state.pending=await saved('pending');pendingView();
 optionList($('edition'),current.sources.editions,$('edition').value,x=>(x.sourceContext==='PUBLISHER_EXAMPLE'?'Example':'Supplier')+' · '+x.state+' · '+x.directoryName);
 for(const id of ['compare-before','compare-after'])optionList($(id),current.sources.editions,$(id).value,x=>x.sourceContext+' · '+x.state+' · '+x.directoryName);
 optionList($('comparison-select'),current.comparisons.comparisons,$('comparison-select').value,x=>x.id+' · '+x.counts.changes+' changed identities');
 optionList($('operation'),current.operations.operations,$('operation').value,x=>x.state+' · '+x.id);
 optionList($('package'),current.packages.packages.map(x=>({...x,id:x.exportId})),$('package').value,x=>x.exportId+' · '+x.files+' files');
 const native=await request('/api/cases?limit=100');const cases=Array.isArray(native)?native:[...(native.cases??[])];let next=native.nextOffset;
 while(next!==null&&next!==undefined){const page=await request('/api/cases?'+new URLSearchParams({offset:next,limit:200}));cases.push(...page.cases);next=page.nextOffset;}
 const statuses=$('metadata-status'),selectedStatus=statuses.value;statuses.replaceChildren(...(native.statuses??[]).map(value=>new Option(value,value)));if((native.statuses??[]).includes(selectedStatus))statuses.value=selectedStatus;
 optionList($('case-select'),cases,$('case-select').value,x=>(x.metadata?.merchant||x.id)+' · '+(x.metadata?.status??''));
 status('Original source, case history and retained packages are available.');
}
function lines(id){return $(id).value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);}
function path(id){const value=JSON.parse($(id).value);if(!Array.isArray(value)||!value.length||value.some(x=>typeof x!=='string'||!x))fail('Use a nonempty array of exact field names.');return value;}
function mapping(){
 const outer=$('outer-path').value.trim()?{outerTimestamp:{path:path('outer-path'),unit:$('outer-unit').value}}:{};
 return $('layout').value==='fields'?{schema:'curity.audit-mapping/v1',layout:'fields',fields:{type:path('type-path'),id:path('id-path'),instant:path('instant-path'),message:path('message-path')},contentPath:path('content-path'),...outer}:
 {schema:'curity.audit-mapping/v1',layout:'curity-message',messagePath:path('message-path'),...outer};
}
function filesChanged(){
 $('file-list').replaceChildren();[...$('source-files').files].forEach((file,index)=>{
  const row=el('div',undefined,'file-row');row.append(el('span',file.name+' · '+file.size.toLocaleString()+' bytes'));
  const label=el('label','Framing'),select=el('select');select.id='format-'+index;
  for(const [value,text]of [['json','JSON document'],['ndjson','NDJSON records']])select.add(new Option(text,value));
  select.value=/\.(ndjson|jsonl)$/i.test(file.name)?'ndjson':'json';label.append(select);row.append(label);$('file-list').append(row);
 });
}
function renderComparison(result){
 const c=result.comparison,box=$('comparison-summary');box.replaceChildren();
 box.append(el('h3','All classifiable event identities'),el('p','Source: '+c.sourceState.before+' → '+c.sourceState.after),
  el('p','Installation: '+c.installationId),el('p','Mapping '+(c.mappingChanged?'changed':'unchanged')+' · Configuration '+(c.configurationChanged?'changed':'unchanged')));
 const dl=el('dl');for(const [key,value]of Object.entries(c.counts))dl.append(el('dt',key.replaceAll(/([A-Z])/g,' $1')),el('dd',String(value)));box.append(dl);
 box.append(el('p','Original files added: '+c.addedFiles.length+' · removed: '+c.removedFiles.length));
 const detail=el('details'),summary=el('summary','Source identities, original findings and complete result');detail.append(summary,el('pre',display(c)));box.append(detail);
 const downloads=$('comparison-downloads');downloads.replaceChildren();
 for(const name of ['comparison.json','changes.jsonl']){const a=el('a','Download complete '+name,'download');a.href='/api/curity/comparison-file?'+new URLSearchParams({comparisonId:result.comparisonId,name});downloads.append(a);}
}
async function compareSources(){
 const beforeEditionId=$('compare-before').value,afterEditionId=$('compare-after').value;
 if(!beforeEditionId||!afterEditionId)fail('Select both original source editions.');
 const result=await act('/api/curity/source/compare',{comparisonId:uuid('compare'),beforeEditionId,afterEditionId});
 await refresh();$('comparison-select').value=result.comparisonId;renderComparison(result);status('Complete source comparison retained. Download the full changes report for every classified identity.');
}
async function selectComparison(){
 const comparisonId=$('comparison-select').value;if(!comparisonId)return;
 renderComparison(await request('/api/curity/comparison?'+new URLSearchParams({comparisonId})));
}
async function sourceFiles(){const files=[...$('source-files').files];if(!files.length||files.length>20)fail('Choose 1..20 complete original files.');
 if(files.reduce((sum,file)=>sum+file.size,0)>1024*1024*1024)fail('The selected complete originals exceed one GiB.');
 const pins=[];for(let i=0;i<files.length;i++){
  status('Hashing original '+files[i].name);pins.push({name:files[i].name,bytes:files[i].size,sha256:await hashFile(files[i]),format:$('format-'+i).value});}
 return {files,pins};
}
async function intake(){
 const {files,pins}=await sourceFiles();let job=await saved('intake');
 if(job){if(JSON.stringify(job.body.files)!==JSON.stringify(pins))fail('Reselect the original files and framing to finish this retained intake.');}
 else{
  const installationId=$('installation').value.trim(),configurationHash=$('configuration').value;
  const observation=$('observation').value.trim()?JSON.parse($('observation').value):null;
  const body={id:uuid('source'),installationId,sourceContext:$('source-context').value,sourceEdition:$('source-edition').value,
   files:pins,mapping:mapping(),coverage:{profiles:lines('coverage-profiles'),listeners:lines('coverage-listeners')},
   binding:{installationId,resourceId:$('resource').value,configurationHash,window:{start:$('window-start').value,end:$('window-end').value},observation},
   review:{confirmed:false,operator:null,reason:null,decisions:[],selection:[]}};
  job={id:body.id,body};await saved('intake',job,true,null);
 }
 await act('/api/curity/source/prepare',job.body);
 for(let index=0;index<files.length;index++){status('Retaining original '+files[index].name);await request('/api/curity/source/upload?'+new URLSearchParams({inputId:job.id,index}),{body:files[index]});}
 const result=await act('/api/curity/source/build',{inputId:job.id});
 await saved('intake',null,true,job.id);await refresh();$('edition').value=result.editionId;await selectEdition();
 status('The original source is retained. Inspect occurrences and findings before confirming a review.');
}
const referenceKey=ref=>ref.sourceId+':'+ref.recordOrdinal;
async function retainReview(){if(!state.edition)return;await saved('review-'+state.edition.id,{selection:[...state.selection],decisions:[...state.decisions]},true);}
async function selectEdition(){
 const id=$('edition').value;++state.generation;state.after=0;state.next=null;state.selection.clear();state.decisions.clear();
 if(!id){state.edition=null;$('evidence').replaceChildren();return;}
 const generation=state.generation,manifest=await request('/api/curity/manifest?'+new URLSearchParams({editionId:id}));
 if(generation!==state.generation)return;state.edition=manifest;
 const draft=await saved('review-'+id);if(generation!==state.generation)return;
 if(draft){state.selection=new Map(draft.selection);state.decisions=new Map(draft.decisions);}
 else for(const ref of manifest.review?.selectedReferences??[])state.selection.set(referenceKey(ref),ref);
 $('edition-summary').textContent=(manifest.sourceContext==='PUBLISHER_EXAMPLE'?'PUBLISHER EXAMPLE — ':'SUPPLIER EXPORT — ')+manifest.state+
  ' · '+(manifest.review?.confirmed?'Confirmed review':'Inspection only')+' · '+display(manifest.counts)+
  ' · Installation '+manifest.binding.installationId+' · Resource '+manifest.binding.resourceId;
 const originals=el('div');for(const file of manifest.sourceFiles){
  const a=el('a','Download complete original · '+(file.name??file.sourceId),'download');
  a.href='/api/curity/source-file?'+new URLSearchParams({editionId:id,sourceId:file.sourceId});originals.append(a);
 }$('edition-summary').append(originals);
 selectionSummary();await loadPage('events',0);
}
function selectionSummary(){$('selection-summary').textContent=state.selection.size+' exact occurrences selected. Decisions are retained per source file and original record ordinal.';}
function typed(field){if(!field?.present)return '(absent)';if(field.type==='number')return field.lexeme;
 if(field.type==='object'||field.type==='array')return field.json;if(field.type==='null')return 'null';return field.value===''?'"" (empty)':String(field.value);}
async function rawRecord(row){
 const result=await request('/api/curity/source/original',{body:{editionId:state.edition.id,ref:row.ref}});
 const raw=Uint8Array.from(atob(result.base64),x=>x.charCodeAt(0));
 if(await hash(raw)!==result.sha256)fail('The exact original record hash changed.');
 $('original-record').textContent=new TextDecoder('utf-8',{fatal:true}).decode(raw);
}
function renderEvent(row){
 const box=el('article',undefined,'event '+row.disposition),ref=row.ref,k=referenceKey(ref);
 box.append(el('h3',typed(row.fields?.type)+' · '+(row.instant?.literal??'No classified audit instant')));
 box.append(el('p',row.disposition+' · '+ref.sourceId+' · original record '+ref.recordOrdinal,'muted'));
 if(row.error)box.append(el('p',display(row.error)));
 if(row.fields){const dl=el('dl');for(const name of ['id','message']){dl.append(el('dt',name),el('dd',typed(row.fields[name])));}box.append(dl);}
 const actions=el('div',undefined,'event-actions'),choose=el('label','Select occurrence'),check=el('input');check.type='checkbox';check.checked=state.selection.has(k);
 check.addEventListener('change',()=>task(async()=>{if(check.checked){if(state.selection.size>=1000){check.checked=false;fail('Select at most 1,000 occurrences for one case review.');}state.selection.set(k,{...ref,eventId:row.eventId,eventKey:row.eventKey,contentSha256:row.contentSha256,disposition:row.disposition});}else state.selection.delete(k);await retainReview();selectionSummary();}));
 choose.prepend(check);actions.append(choose);
 const decision=el('label','Review decision'),select=el('select');
 for(const[v,t]of [['','Keep source classification'],['include','Include'],['exclude','Exclude'],['accept-collision','Accept this collision occurrence']])select.add(new Option(t,v));
 select.value=state.decisions.get(k)?.action??'';decision.append(select);
 const reason=el('label','Decision reason'),reasonInput=el('input');reasonInput.value=state.decisions.get(k)?.reason??'';reasonInput.maxLength=4000;reason.append(reasonInput);
 const update=()=>task(async()=>{if(select.value)state.decisions.set(k,{sourceId:ref.sourceId,recordOrdinal:ref.recordOrdinal,action:select.value,reason:reasonInput.value});else state.decisions.delete(k);await retainReview();});
 select.addEventListener('change',update);reasonInput.addEventListener('change',update);actions.append(decision,reason);
 const raw=el('button','Read original');raw.type='button';raw.addEventListener('click',()=>task(()=>rawRecord(row)));actions.append(raw);box.append(actions);
 const details=el('details'),summary=el('summary','Exact source identity');details.append(summary,el('pre',display(row)));box.append(details);return box;
}
async function loadPage(kind,after){
 if(!state.edition)fail('Choose a retained edition.');const generation=++state.generation,id=state.edition.id;
 const result=await request('/api/curity/'+kind+'?'+new URLSearchParams({editionId:id,after,limit:50}));
 if(generation!==state.generation||state.edition?.id!==id)return;
 state.page=kind;state.after=after;state.next=result.nextAfter;$('next-page').disabled=result.nextAfter===null;
 $('page-summary').textContent=kind+' '+(result.items.length?after+1:0)+'–'+(after+result.items.length)+' of '+result.total;
 $('evidence').replaceChildren(...result.items.map(row=>kind==='events'?renderEvent(row):(()=>{const n=el('article',undefined,'event');n.append(el('h3',row.code+' · '+row.severity),el('p',row.message),el('pre',display(row.ref)));return n;})()));
}
async function confirmReview(){
 if(!state.edition||!state.selection.size)fail('Choose source occurrences before confirming a review.');
 const operator=$('operator').value.trim(),reason=$('review-reason').value.trim();if(!operator||!reason)fail('Enter the named operator and the review reason.');
 const original=state.catalog.sources.editions.find(x=>x.id===state.edition.id);
 if(!original)fail('Refresh the original source edition.');
 if(original.directoryName.startsWith('received-'))fail('This received review is already immutable. Attach its exact confirmed selection, or receive its originals as an explicit new source edition.');
 let job=await saved('confirm-review');
 const review={confirmed:true,operator,reason,decisions:[...state.decisions.values()],selection:[...state.selection.values()].map(x=>({sourceId:x.sourceId,recordOrdinal:x.recordOrdinal}))};
 if(!job){job={id:uuid('review'),body:{inputId:null,sourceInputId:original.directoryName,review}};job.body.inputId=job.id;await saved('confirm-review',job,true,null);}
 else if(job.body.sourceInputId!==original.directoryName||JSON.stringify(job.body.review)!==JSON.stringify(review))fail('The saved review is for another selection. Finish its original action first.');
 await act('/api/curity/source/review',job.body);const result=await act('/api/curity/source/build',{inputId:job.id});
 await saved('confirm-review',null,true,job.id);await refresh();$('edition').value=result.editionId;await selectEdition();status('The named review is frozen with its exact source and mapping.');
}
async function selectCase(){
 const id=$('case-select').value;state.case=null;if(!id){$('case-summary').textContent='';return;}
 const result=await request('/api/cases/'+encodeURIComponent(id));state.case=result.case??result;
 $('case-summary').textContent=display({id:state.case.id,revision:state.case.revision,metadata:state.case.metadata});
}
function metadataFields(){
 const box=$('metadata-fields');for(const[name,label]of [['merchant','Merchant'],['owner','Owner'],['status','Status'],['followUpOn','Follow-up date'],['nextAction','Next action']]){
  const n=el('label'),enabled=el('input');enabled.type='checkbox';enabled.id='change-'+name;n.append(enabled,document.createTextNode('Change '+label));
  let input;if(name==='status'){input=el('select');/* The original case API supplies its maintained status vocabulary. */}
  else{input=el('input');if(name==='followUpOn')input.type='date';}input.id='metadata-'+name;input.disabled=true;enabled.addEventListener('change',()=>{input.disabled=!enabled.checked;if(enabled.checked&&state.case)input.value=state.case.metadata[name]??'';});n.append(input);box.append(n);
 }
}
async function prepareCase(){
 if(!state.edition?.review?.confirmed||!state.case)fail('Choose a confirmed review and read the current existing case.');
 const selected=[...state.selection.values()],finalRefs=state.edition.review.selectedReferences;
 if(!selected.length)fail('Select evidence from the confirmed review.');
 const keys=[];for(const ref of selected){const final=finalRefs.find(x=>referenceKey(x)===referenceKey(ref));if(!final)fail('This occurrence is outside the confirmed review. Freeze a new review to change it.');keys.push(final.eventKey);}
 const metadata={};for(const name of ['merchant','owner','status','followUpOn','nextAction'])if($('change-'+name).checked)metadata[name]=$('metadata-'+name).value;
 const body={operationId:uuid('case'),caseId:state.case.id,expectedRevision:state.case.revision,editionId:state.edition.id,reviewId:state.edition.review.id,eventKeys:[...new Set(keys)],actor:$('operator').value.trim(),note:$('case-note').value,metadata};
 if($('incident-source').value.trim())body.incident={sourceId:$('incident-source').value.trim(),incidentId:$('incident-id').value.trim(),expectedRevision:Number($('incident-revision').value),configurationSha256:$('incident-configuration').value.trim()};
 const result=await act('/api/curity/case/prepare',body);state.operation=result;$('case-plan').textContent=display(result);await refresh();$('operation').value=result.id;buttons();status('Review the exact before/after fields, then apply this saved operation.');
}
function buttons(){const selected=Boolean(state.operation);$('apply-case').disabled=!selected;$('compare-case').disabled=!selected;$('rollback-case').disabled=!selected;$('ack-incident').disabled=!state.operation?.incident||Boolean(state.operation?.received);}
async function selectOperation(){
 const id=$('operation').value;if(!id){state.operation=null;buttons();return;}
 const result=await request('/api/curity/operation?'+new URLSearchParams({operationId:id}));state.operation=result.plan;$('case-plan').textContent=display(result);buttons();
}
async function compareCase(){if(!state.operation)fail('Choose a case operation.');const result=await request('/api/curity/compare?'+new URLSearchParams({operationId:state.operation.id}));$('case-plan').textContent=display(result);return result;}
async function rollbackCase(){
 const current=await compareCase();if(!confirm('Restore only this operation’s still-unchanged metadata fields? Staff-changed fields will be skipped and reported; other still-matching fields will be restored.'))return;
 const expectedRevision=current.current?.revision??current.case?.revision;if(!expectedRevision)fail('The original comparison has no current revision.');
 const result=await act('/api/curity/case/rollback',{operationId:state.operation.id,rollbackId:uuid('rollback'),expectedRevision,actor:$('operator').value.trim()});$('case-plan').textContent=display(result);await refresh();status('The selected original fields were restored through the native case writer.');
}
async function exportPackage(){if(!state.operation)fail('Choose an applied case operation.');const result=await act('/api/curity/package/export',{operationId:state.operation.id,exportId:uuid('package')});await refresh();$('package').value=result.exportId??result.manifest?.exportId??'';status('The complete original package is retained. Save every declared member.');}
async function packageManifest(){
 const exportId=$('package').value;if(!exportId)fail('Choose a completed package.');
 const response=await request('/api/curity/package-file?'+new URLSearchParams({exportId,name:'curity-case-package.json'}),{raw:true});
 const raw=await response.arrayBuffer();if(await hash(raw)!==response.headers.get('x-content-sha256'))fail('The package manifest changed.');
 const manifest=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));return {exportId,manifest,raw};
}
const fileUrl=(exportId,name)=>'/api/curity/package-file?'+new URLSearchParams({exportId,name});
async function showDownloads(){
 const p=await packageManifest(),box=$('downloads');box.replaceChildren(el('p','Keep this exact folder layout. The receiver requires every listed file; a manifest alone is incomplete.'));
 for(const row of [{name:'curity-case-package.json',bytes:p.raw.byteLength},...p.manifest.files]){
  const a=el('a',row.name+' · '+row.bytes.toLocaleString()+' bytes','download');a.href=fileUrl(p.exportId,row.name);a.download=row.name.split('/').at(-1);box.append(a);
 }
}
async function savePackage(){
 if(!window.showDirectoryPicker){await showDownloads();status('This browser cannot write a folder directly. Download every listed member into its shown relative folder, or use the complete retained export directory with the CLI guide.');return;}
 const directory=await showDirectoryPicker({mode:'readwrite'}),p=await packageManifest();
 const files=[{name:'curity-case-package.json',bytes:p.raw.byteLength,sha256:await hash(p.raw)},...p.manifest.files];
 for(const row of files){
  let parent=directory;const parts=row.name.split('/');for(const name of parts.slice(0,-1))parent=await parent.getDirectoryHandle(name,{create:true});
  let existing=null;try{existing=await parent.getFileHandle(parts.at(-1));}catch(e){if(e.name!=='NotFoundError')throw e;}
  if(existing){const file=await existing.getFile();if(file.size!==row.bytes||await hashFile(file)!==row.sha256)fail('Preserve the different existing destination '+row.name);continue;}
  status('Saving complete package · '+row.name);const response=await request(fileUrl(p.exportId,row.name),{raw:true});
  if(response.headers.get('x-content-sha256')!==row.sha256)fail('The selected original download identity changed.');
  const handle=await parent.getFileHandle(parts.at(-1),{create:true}),writer=await handle.createWritable();
  try{await response.body.pipeTo(writer);}catch(e){await writer.abort().catch(()=>{});throw e;}
  const savedFile=await handle.getFile();if(savedFile.size!==row.bytes||await hashFile(savedFile)!==row.sha256)fail('The saved original bytes differ: '+row.name);
 }
 status('Complete package folder saved: '+files.length+' original members.');
}
async function receivePackage(){
 const files=[...$('receive-folder').files],byPath=new Map();if(!files.length)fail('Select the complete exported folder.');
 const prefix=files[0].webkitRelativePath.split('/')[0]+'/';for(const file of files){const name=file.webkitRelativePath.slice(prefix.length);if(byPath.has(name))fail('The selected folder has duplicate member names.');byPath.set(name,file);}
 const mf=byPath.get('curity-case-package.json');if(!mf)fail('Choose the folder whose root contains curity-case-package.json.');
 const manifestText=await mf.text(),manifest=JSON.parse(manifestText),sha=await hash(await mf.arrayBuffer());
 for(const row of manifest.files??[]){const file=byPath.get(row.name);if(!file||file.size!==row.bytes)fail('The complete original member is missing: '+row.name);}
 let job=await saved('receive');if(job&&job.manifestSha256!==sha)fail('Finish the original selected package before receiving another one.');
 if(!job){job={id:uuid('receive'),inputId:uuid('incoming'),manifestSha256:sha,actor:$('operator').value.trim()};if(!job.actor)fail('Enter the named receiving operator.');await saved('receive',job,true,null);}
 await act('/api/curity/package/prepare',{inputId:job.inputId,manifestText});
 for(const row of manifest.files){status('Receiving complete original · '+row.name);await request('/api/curity/package/upload?'+new URLSearchParams({inputId:job.inputId,name:row.name}),{body:byPath.get(row.name)});}
 const result=await act('/api/curity/package/receive',{inputId:job.inputId,requestId:job.id,actor:job.actor});
 await saved('receive',null,true,job.id);$('receive-result').textContent=display(result);await refresh();status('The original native receiver has reopened the complete case. Later recipient edits remain intact.');
}
$('source-files').addEventListener('change',filesChanged);
$('source-form').addEventListener('submit',e=>{e.preventDefault();void task(intake);});
for(const[id,work]of [['refresh',refresh],['load-events',()=>loadPage('events',0)],['load-findings',()=>loadPage('findings',0)],
 ['next-page',()=>loadPage(state.page,state.next)],['confirm-review',confirmReview],['prepare-case',prepareCase],
 ['compare-case',compareCase],['rollback-case',rollbackCase],['export-package',exportPackage],['save-package',savePackage],
 ['compare-sources',compareSources],['show-downloads',showDownloads],['receive-package',receivePackage],
 ['apply-case',async()=>{const result=await act('/api/curity/case/apply',{operationId:state.operation.id});$('case-plan').textContent=display(result);await refresh();status('Reviewed evidence applied to the original case.');}],
 ['ack-incident',async()=>{const notes=prompt('Acknowledgment note for the original incident');if(notes===null)return;const r=await act('/api/curity/case/acknowledge',{operationId:state.operation.id,by:$('operator').value.trim(),notes});$('case-plan').textContent=display(r);}],
 ['retry-action',async()=>{const original=state.pending,result=await sendSaved();if(original.path==='/api/curity/source/compare')renderComparison(result);else $('case-plan').textContent=display(result);await refresh();status('Original saved action received. Continue the same workflow button to finish its remaining steps.');}],
 ['dismiss-action',async()=>{const original=state.pending;if(!original?.error?.status||original.error.status<400||original.error.status>=500)fail('Retain this action until its original outcome can be received.');
  if(!confirm('Keep the failed action in local history and close it? This does not undo any native operation.'))return;
  await saved('history-'+original.id,original,true);await saved('pending',null,true,original.id);state.pending=null;pendingView();}]
 ])$(id).addEventListener('click',()=>void task(work));
$('edition').addEventListener('change',()=>void task(selectEdition));$('case-select').addEventListener('change',()=>void task(selectCase));
$('operation').addEventListener('change',()=>void task(selectOperation));
$('comparison-select').addEventListener('change',()=>void task(selectComparison));
metadataFields();void task(refresh);
