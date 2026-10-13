// MIT. Original workspace token remains in memory; pending bodies remain exact.
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const state={token:'',scope:null,storageReady:false,storageError:null,record:null,pending:null,last:null,busy:false,preview:null,request:null,collection:null,canPrepare:false,tab:'prepare'};
let dbPromise=null,generation=0;
const message=t=>{$('#status').textContent=t;};
function db(){if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{const request=indexedDB.open('sf88-customer-delivery',1);request.onupgradeneeded=()=>request.result.createObjectStore('states');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);}).catch(error=>{dbPromise=null;throw error;});return dbPromise;}
async function stored(scope,value,expected){
 const database=await db();
 return new Promise((resolve,reject)=>{
  const writing=value!==undefined,tx=database.transaction('states',writing?'readwrite':'readonly'),store=tx.objectStore('states');let result,failure;
  const read=store.get(scope);
  read.onsuccess=()=>{
   const current=read.result??null;
   if(!writing){result=read.result;return;}
   if(JSON.stringify(current)!==JSON.stringify(expected??null)){
    failure=Object.assign(new Error('Another tab changed the retained operation. Read and continue that exact request.'),{code:'CUSTOMER_DELIVERY_STORAGE_CONFLICT'});tx.abort();return;
   }
   const put=store.put(value,scope);put.onsuccess=()=>result=value;
  };
  tx.oncomplete=()=>resolve(result);
  tx.onerror=()=>reject(failure??tx.error);
  tx.onabort=()=>reject(failure??tx.error??new Error('Storage aborted'));
 });
}
function controls(){
 const ready=Boolean(state.token&&state.scope&&state.storageReady&&!state.storageError&&!state.busy);
 for(const e of $$('#prepare-form input,#prepare-form select,#prepare-form textarea,#prepare-form button,#prepare-package'))e.disabled=!ready||Boolean(state.pending)||!state.canPrepare;
 for(const e of $$('#receive-form input,#receive-form button'))e.disabled=!ready||Boolean(state.pending);
 $('#retry').disabled=!ready||!state.pending;$('#export-request').disabled=!state.pending;$('#archive-request').disabled=!ready||!state.pending;$('#read-storage').hidden=!state.storageError;$('#read-storage').disabled=state.busy;
 $('#recovery').hidden=!state.pending&&!state.storageError;
 $('#pending-description').textContent=state.storageError?'The retained request has not been read. Retry that read before making a new delivery.':state.pending?.kind==='receive'?'The original package upload/receiving operation is retained. Reselect the same file if its bytes are still needed.':state.pending?'The exact reviewed delivery request is retained. Continue it to observe or finish the original package.':'';
 $('#resume-file-label').hidden=state.pending?.kind!=='receive';
 $('#prepare-tab').disabled=!state.canPrepare;
}
async function request(path,{method='GET',body,raw=false}={}){
 const response=await fetch(path,{method,headers:{Authorization:'Bearer '+state.token,...(body!==undefined?{'Content-Type':'application/json'}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 if(!response.ok){let error;try{error=await response.json();}catch{}throw Object.assign(new Error(error?.error??'HTTP '+response.status),{code:error?.error,status:response.status});}
 return raw?response:response.json();
}
async function readState(){
 const scope=state.scope,read=++generation;state.storageReady=false;state.storageError=null;controls();
 try{const saved=await stored(scope);if(scope!==state.scope||read!==generation)return;state.record=saved??null;state.pending=saved?.pending??null;state.last=saved?.last??null;state.storageReady=true;}
 catch(error){if(scope===state.scope&&read===generation)state.storageError=String(error.message??error);}
 controls();
}
async function save(next){
 if(!state.storageReady||!state.scope)throw new Error('Read the retained request first.');
 const scope=state.scope,expected=state.record;
 try{await stored(scope,next,expected);}
 catch(error){if(error?.code==='CUSTOMER_DELIVERY_STORAGE_CONFLICT'&&scope===state.scope)await readState();throw error;}
 if(scope!==state.scope)throw new Error('Workspace changed while saving.');
 state.record=next;state.pending=next.pending;state.last=next.last;controls();
}
async function busy(fn){if(state.busy)throw new Error('Wait for the current operation.');state.busy=true;controls();try{return await fn();}catch(error){message(error.message);throw error;}finally{state.busy=false;controls();}}
function tab(name){state.tab=name;for(const e of $$('[data-panel]'))e.hidden=e.dataset.panel!==name;for(const e of $$('[data-tab]'))e.setAttribute('aria-current',String(e.dataset.tab===name));}
function text(parent,tag,value,className){const e=document.createElement(tag);e.textContent=value;if(className)e.className=className;parent.append(e);return e;}
async function selectCollection(){
 state.preview=null;state.request=null;$('#preview').hidden=true;
 if(!$('#collection').value)return;
 const selected=$('#collection').value,view=await request('/api/collections/'+encodeURIComponent(selected));
 if(selected!==$('#collection').value)return;
 state.collection=view;$('#intents').replaceChildren();
 for(const row of view.items){const label=document.createElement('label');label.className='check';const input=document.createElement('input');input.type='checkbox';input.value=row.intentId;input.checked=Boolean(row.job&&!row.error);input.dataset.intent='true';label.append(input,document.createTextNode(row.intentId+' — '+row.state+' — '+(row.job?.outcome?.responseFile?.status??'no saved response')));$('#intents').append(label);}
 controls();
}
async function login(){
 state.token=$('#token').value.trim();if(!state.token)throw new Error('Enter the workspace token.');
 state.storageReady=false;state.scope=null;state.record=null;state.pending=null;state.preview=null;controls();
 const status=await request('/api/customer-delivery/status');state.scope=location.origin+'|'+status.scope;state.canPrepare=status.canPrepare;
 await readState();$('#login-panel').hidden=true;$('#workspace').hidden=false;
 $('#collections-link').href='/#'+encodeURIComponent(state.token);
 if(state.canPrepare){const listed=await request('/api/collections');$('#collection').replaceChildren();for(const row of listed.collections){const option=new Option(row.name+' · '+row.id,row.id);$('#collection').append(option);}await selectCollection();}else tab('receive');
 $('#delivery-id').value='delivery-'+crypto.randomUUID();await renderDeliveries(status.deliveries);message(state.storageError?'Retained-request storage needs recovery.':'Workspace opened.');controls();
}
function currentRequest(){
 if(!state.collection)throw new Error('Select a collection.');
 return{id:$('#delivery-id').value.trim(),collectionId:state.collection.id,expectedManifestSha256:state.collection.manifestSha256,title:$('#title').value,note:$('#note').value,intentIds:$$('[data-intent]:checked').map(e=>e.value),sourceRoot:$('#source-root').value,sourceManifest:$('#source-manifest').value,maxVerifyBytes:Number($('#verify-limit').value),allowIncomplete:$('#allow-incomplete').checked};
}
async function preview(){
 if(!state.storageReady||state.pending)throw new Error('Recover the retained request first.');
 const input=currentRequest(),result=await request('/api/customer-delivery/preview',{method:'POST',body:input});
 state.request=input;state.preview=result;$('#preview-summary').replaceChildren();
 text($('#preview-summary'),'p',result.jobs.length+' original requests; '+result.source.files+' source files, '+result.source.bytes+' source bytes.');
 text($('#preview-summary'),'code','Review SHA-256: '+result.previewSha256);
 text($('#preview-summary'),'p',input.allowIncomplete?'Incomplete outputs are permitted and will be explicitly marked.':'Every selected response must be verified before the package completes.');
 $('#preview').hidden=false;
}
async function prepare(){
 if(!state.storageReady||state.pending||!state.preview)throw new Error('Review a new selection first.');
 if(JSON.stringify(currentRequest())!==JSON.stringify(state.request))throw new Error('The form changed; review it again.');
 const pending={kind:'prepare',path:'/api/customer-delivery/prepare',body:{...state.request,expectedPreviewSha256:state.preview.previewSha256}};
 await save({pending,last:state.last});return continuePending();
}
const hex=b=>[...new Uint8Array(b)].map(v=>v.toString(16).padStart(2,'0')).join('');
const sha=async b=>hex(await crypto.subtle.digest('SHA-256',b));
const base64=b=>{let out='';for(const x of new Uint8Array(b))out+=String.fromCharCode(x);return btoa(out);};
async function continuePending(){
 if(!state.storageReady||!state.pending)throw new Error('No recovered request is available.');
 const pending=state.pending;let result;
 if(pending.kind==='prepare')result=await request(pending.path,{method:'POST',body:pending.body});
 else{
  const body=pending.body;let upload=await request('/api/customer-delivery/uploads',{method:'POST',body});
  const file=$('#resume-file').files[0]??$('#package-file').files[0];
  if(upload.offset<body.bytes){if(!file||file.name!==body.filename||file.size!==body.bytes)throw new Error('Reselect the original file with the retained name and byte count. Its complete SHA-256 will be verified.');}
  while(upload.offset<body.bytes){
   const offset=upload.offset,part=await file.slice(offset,Math.min(body.bytes,offset+65536)).arrayBuffer();
   upload=await request('/api/customer-delivery/uploads/'+body.sha256+'/chunk',{method:'POST',body:{offset,base64:base64(part),sha256:await sha(part)}});
   message('Retained '+upload.offset+' of '+body.bytes+' package bytes.');
  }
  await request('/api/customer-delivery/uploads/'+body.sha256+'/finish',{method:'POST',body:{}});
  result=await request('/api/customer-delivery/uploads/'+body.sha256+'/receive',{method:'POST',body:{}});
 }
 await save({pending:null,last:{kind:pending.kind,result}});
 if(pending.kind==='receive'){renderReceived(result);$('#received-sha').value=pending.body.sha256;tab('receive');}
 else{await refresh();tab('deliveries');}
 message('The original '+(pending.kind==='receive'?'package is verified and received.':'delivery package is complete.'));
 return result;
}
async function startReceive(){
 if(!state.storageReady||state.pending)throw new Error('Recover the retained request first.');const file=$('#package-file').files[0],expected=$('#package-sha').value;
 if(!file||!/^[a-f0-9]{64}$/.test(expected))throw new Error('Select the original package and its sender-provided SHA-256.');
 await save({pending:{kind:'receive',body:{sha256:expected,bytes:file.size,filename:file.name}},last:state.last});return continuePending();
}
async function download(path,{method='GET',body,filename}={}){
 const response=await request(path,{method,body,raw:true});
 const blob=await response.blob(),expected=response.headers.get('x-content-sha256'),length=Number(response.headers.get('content-length'));
 if(!/^[a-f0-9]{64}$/.test(expected??'')||blob.size!==length||await sha(await blob.arrayBuffer())!==expected)throw new Error('The complete downloaded file differs from its original descriptor.');
 const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download=filename??'customer-delivery.ndjson';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),30000);
}
async function renderDeliveries(rows){
 const root=$('#delivery-list');root.replaceChildren();if(!rows.length)text(root,'p','No named customer deliveries yet.');
 for(const row of rows){const card=document.createElement('article');card.className='card';text(card,'h3',row.title);text(card,'p',row.id+' · '+row.state+(row.state==='COMPLETE'?' · '+(row.outputsComplete?'all responses included':'incomplete outputs declared'):''));if(row.package){text(card,'code',row.package.sha256);text(card,'p',row.package.bytes+' package bytes');const b=text(card,'button','Download complete package');b.dataset.download=row.id;b.onclick=()=>busy(()=>download('/api/customer-delivery/deliveries/'+encodeURIComponent(row.id)+'/file',{filename:row.package.filename})).catch(()=>{});}root.append(card);}
}
async function refresh(){const status=await request('/api/customer-delivery/status');await renderDeliveries(status.deliveries);}
function renderReceived(result){
 const root=$('#received-view');root.replaceChildren();text(root,'h3',result.manifest.title);text(root,'p',result.outputsComplete?'All selected responses were verified.':'This package explicitly contains unavailable or incomplete selected outputs.');text(root,'code',result.sha256);text(root,'p',result.files+' complete files · '+result.contentBytes+' content bytes');
 const wrap=document.createElement('div');wrap.className='table-wrap';const table=document.createElement('table');const tr=document.createElement('tr');for(const label of ['Original request','Observation','Response'])text(tr,'th',label);table.append(tr);
 for(const row of result.manifest.rows){const tr=document.createElement('tr');text(tr,'td',row.intentId);text(tr,'td',row.nativeState+' / '+row.observation.settlementStatus);const td=text(tr,'td',row.output.state);if(row.output.path){text(td,'small',row.output.bytes+' bytes · '+row.output.sha256);const b=text(td,'button','Download response');b.onclick=()=>busy(()=>download('/api/customer-delivery/received/'+result.sha256+'/member',{method:'POST',body:{path:row.output.path},filename:row.output.path.split('/').at(-1)})).catch(()=>{});}table.append(tr);}wrap.append(table);root.append(wrap);
 for(const path of ['review.json','review.html']){const b=text(root,'button','Download '+path);b.onclick=()=>busy(()=>download('/api/customer-delivery/received/'+result.sha256+'/member',{method:'POST',body:{path},filename:path})).catch(()=>{});}
 const details=document.createElement('details');text(details,'summary','Complete application source: '+result.manifest.source.files.length+' files');const pre=document.createElement('pre');pre.textContent=result.manifest.source.files.map(row=>row.path+' · '+row.bytes+' · '+row.sha256).join('\n');details.append(pre);root.append(details);
}
function wireForm(selector,fn){$(selector).addEventListener('submit',event=>{event.preventDefault();busy(fn).catch(()=>{});});}
wireForm('#login-form',login);wireForm('#prepare-form',preview);wireForm('#receive-form',startReceive);wireForm('#open-received',async()=>renderReceived(await request('/api/customer-delivery/received/'+$('#received-sha').value)));
$('#prepare-package').onclick=()=>busy(prepare).catch(()=>{});$('#retry').onclick=()=>busy(continuePending).catch(()=>{});$('#read-storage').onclick=()=>busy(readState).catch(()=>{});$('#refresh').onclick=()=>busy(refresh).catch(()=>{});$('#collection').onchange=()=>busy(selectCollection).catch(()=>{});
for(const e of $$('[data-tab]'))e.onclick=()=>tab(e.dataset.tab);
$('#archive-request').onclick=()=>busy(async()=>{
 if(!state.storageReady||!state.pending)throw new Error('Read the original request first.');
 if(!confirm('Archive this browser request? The original named delivery or upload remains on the server, including any uncertain completed result. A different selection requires a new explicit delivery ID.'))return;
 const original=state.pending,key=await sha(new TextEncoder().encode(JSON.stringify(original)));
 const archiveKey=state.scope+':archived:'+key,prior=await stored(archiveKey);
 if(prior){if(JSON.stringify(prior.pending)!==JSON.stringify(original))throw new Error('The archived request differs.');}
 else await stored(archiveKey,{pending:original,archivedAt:new Date().toISOString()},null);
 await save({pending:null,last:state.last});message('Original request archived locally; its server records remain unchanged.');
}).catch(()=>{});
$('#export-request').onclick=()=>{if(!state.pending)return;const blob=new Blob([JSON.stringify(state.pending,null,2)+'\n'],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='retained-customer-delivery-request.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),30000);};
window.customerDelivery=Object.freeze({inspect:()=>({scope:state.scope,storageReady:state.storageReady,storageError:state.storageError,busy:state.busy,pending:state.pending?{kind:state.pending.kind,id:state.pending.body.id??state.pending.body.sha256}:null,tab:state.tab})});
const fragment=decodeURIComponent(location.hash.slice(1));history.replaceState(null,'',location.pathname);if(fragment){$('#token').value=fragment;busy(login).catch(()=>{});}else controls();
