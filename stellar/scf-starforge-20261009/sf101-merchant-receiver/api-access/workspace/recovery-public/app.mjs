// MIT. Same-journal browser continuation. No passphrase value is collected.
const $=id=>document.getElementById(id),authKey='api-customer-recovery-token:'+location.origin;
let token=location.hash.slice(1)||sessionStorage.getItem(authKey)||'',session=null,review=null,selected=null,generation=0,rows=[],nextOffset=null,poll=null,busy=false;
if(location.hash){sessionStorage.setItem(authKey,token);history.replaceState(null,'',location.pathname);}
const msg=(text,error=false)=>{$('message').textContent=text;$('message').className=error?'error':'';};
async function api(path,value){
 const response=await fetch(path,{method:value===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,...(value===undefined?{}:{'Content-Type':'application/json'})},...(value===undefined?{}:{body:JSON.stringify(value)})});
 const result=await response.json();if(!response.ok)throw Error(result.error||'Request failed');return result;
}
function key(){return 'api-customer-recovery:'+session.journalId;}
function draft(){return JSON.parse(localStorage.getItem(key())||'{}');}
function save(change){localStorage.setItem(key(),JSON.stringify({...draft(),...change}));}
function text(tag,value,parent){const el=document.createElement(tag);el.textContent=value;parent.append(el);return el;}
function remember(){if(!session)return;save({fields:Object.fromEntries(['output','passenv','bundle','verify-passenv','python','state-root','restore-passenv','verified'].map(id=>[id,$(id).value]))});}
for(const id of ['output','passenv','bundle','verify-passenv','python','state-root','restore-passenv','verified'])$(id).addEventListener('change',remember);
async function guarded(fn){if(busy)return;busy=true;try{await fn();}catch(e){msg(e.message,true);}finally{busy=false;}}
function renderReview(v){
 review=v;const p=v.profile,node=$('review-summary');node.replaceChildren();
 text('p',p.profiles.length+' passes · '+p.callCount+' saved requests · '+p.taskCount+' retained tasks · revision '+p.revision,node);
 text('p','Workspace '+p.workspaceId,node);text('p','Original root: '+p.stateRoot,node);
 text('p',(p.agent?'Agent setup and journals included. ':'No agent setup selected. ')+p.unresolvedTasks.length+' unresolved tasks will stay under their original identities.',node);
 text('code','Review SHA-256: '+p.reviewSha256,node);
 save({review:v});
}
function renderCustomer(){
 const node=$('customer');node.replaceChildren();if(!session.customer)return;
 text('span','Original customer is open. ',node);const a=text('a','Open customer workspace',node);a.href=session.customer.url;a.target='_blank';a.rel='noopener';
 const button=text('button','Close customer before another capture',node);button.onclick=()=>guarded(async()=>{await api('/api/close-customer',{requestId:session.customer.requestId});await refresh();});
}
function renderRows(){
 $('operations').replaceChildren();
 for(const row of rows){const box=text('div','',$('operations'));box.className='operation';text('strong',row.kind+' · '+row.state,box);text('div',row.requestId,box);text('small',row.createdAt,box);const b=text('button','Open operation',box);b.onclick=()=>guarded(()=>detail(row.requestId));}
 $('more').hidden=nextOffset===null;
 const previous=$('verified').value||draft().fields?.verified,select=$('verified');
 select.replaceChildren();const blank=text('option','Select a completed verification',select);blank.value='';
 for(const row of rows.filter(r=>r.kind==='VERIFY'&&r.state==='COMPLETED')){const o=text('option',row.requestId+' · '+(row.result?.workspaceId||''),select);o.value=row.requestId;}
 if(previous&&[...select.options].some(o=>o.value===previous))select.value=previous;
}
async function refresh(more=false){
 const stamp=generation,current=await api('/api/session');if(session&&current.journalId!==session.journalId)throw Error('Recovery journal changed. Reopen its original launch link.');
 session=current;$('session').textContent='Journal '+current.journalId+' · '+current.directory;$('capture').hidden=!current.sourceConfigured;renderCustomer();
 const page=await api('/api/operations?offset='+(more?nextOffset??0:0)+'&limit=50');if(stamp!==generation)return;
 rows=more?[...rows,...page.items]:page.items;nextOffset=page.nextOffset;renderRows();
}
function schedule(id){
 clearTimeout(poll);poll=setTimeout(async()=>{if(selected!==id)return;try{await detail(id,{silent:true});}catch(e){msg('Status is unavailable. The saved operation is unchanged; refresh or resume the same ID. '+e.message,true);}},1500);
}
async function detail(id,{silent=false}={}){
 const stamp=++generation;selected=id;save({selected:id});const r=await api('/api/operations/'+encodeURIComponent(id));if(stamp!==generation)return;
 $('detail-section').hidden=false;$('detail').replaceChildren();text('p',r.kind+' · '+r.state,$('detail'));text('code',id,$('detail'));
 if(r.result?.application?.profile){const p=r.result.application.profile;text('p',p.profiles.length+' passes, '+p.callCount+' requests, original revision '+p.revision,$('detail'));}
 if(r.error)text('p','Last attempt: '+r.error.code,$('detail'));
 if(r.persistenceError)text('p','The native return is held. Resume this same operation to persist it: '+r.persistenceError,$('detail'));
 $('raw').textContent=JSON.stringify(r,null,2);
 $('resume').disabled=r.state==='COMPLETED'||r.state==='RUNNING'||r.state==='CANCELLING';
 $('cancel').disabled=!['RUNNING','CANCELLING'].includes(r.state);
 $('files').disabled=r.state!=='COMPLETED';$('open-customer').disabled=!(r.kind==='RESTORE'&&r.state==='COMPLETED');
 if(!silent)$('file-list').replaceChildren();
 if(['RUNNING','CANCELLING'].includes(r.state))schedule(id);else{clearTimeout(poll);await refresh();}
 return r;
}
async function start(kind,options){
 const pending=draft().pending;
 if(pending){msg('A previous request may already be saved. Continuing its original ID.');await detail(pending.requestId);return;}
 const request={requestId:crypto.randomUUID(),kind,options};
 save({pending:request}); // before network dispatch; a lost reply never creates another ID
 try{const result=await api('/api/start',request);save({pending:null});await detail(result.requestId);}
 catch(e){msg('The request outcome is unknown. Keep this operation ID: '+request.requestId+'. Refresh to reconcile it. '+e.message,true);throw e;}
}
$('review').onclick=()=>guarded(async()=>{renderReview(await api('/api/review',{}));msg('Original workspace reviewed. Capture uses this exact source revision.');});
$('capture-form').onsubmit=e=>{e.preventDefault();guarded(async()=>{if(!review)throw Error('Review the stopped original workspace first.');remember();await start('SNAPSHOT',{output:$('output').value,passEnv:$('passenv').value,expectedReviewSha256:review.profile.reviewSha256,quiesced:$('quiesced').checked});});};
$('verify-form').onsubmit=e=>{e.preventDefault();guarded(async()=>{remember();await start('VERIFY',{bundle:$('bundle').value,passEnv:$('verify-passenv').value,python:$('python').value});});};
$('verified').onchange=()=>guarded(async()=>{remember();if(!$('verified').value)return;const r=await api('/api/operations/'+$('verified').value);$('state-root').value=r.result.application.profile.stateRoot;$('restore-passenv').value=r.options.passEnv;remember();});
$('restore-form').onsubmit=e=>{e.preventDefault();guarded(async()=>{remember();await start('RESTORE',{verifiedRequestId:$('verified').value,expectedStateRoot:$('state-root').value,passEnv:$('restore-passenv').value,python:$('python').value});});};
$('refresh').onclick=()=>guarded(async()=>{
 await refresh();const p=draft().pending;if(p){const r=await api('/api/start',p);save({pending:null});await detail(r.requestId);}else if(selected)await detail(selected);
 msg('Saved operation history refreshed.');
});
$('more').onclick=()=>guarded(()=>refresh(true));
$('resume').onclick=()=>guarded(async()=>{const id=selected;await api('/api/resume',{requestId:id});await detail(id);});
$('cancel').onclick=()=>guarded(async()=>{const id=selected;await api('/api/cancel',{requestId:id});await detail(id);});
$('open-customer').onclick=()=>guarded(async()=>{const id=selected;await api('/api/open-customer',{requestId:id});await refresh();msg('The existing customer workspace is open. No purchase or API request was dispatched.');});
async function chunk(id,item,offset){
 const r=await api('/api/operations/'+id+'/file?name='+encodeURIComponent(item.name)+'&offset='+offset+'&limit=262144');
 if(r.name!==item.name||r.offset!==offset||r.totalBytes!==item.bytes||r.sha256!==item.sha256)throw Error('Encrypted file identity changed.');
 const bytes=Uint8Array.from(atob(r.base64),c=>c.charCodeAt(0)),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
 if(hash!==r.chunkSha256||bytes.length!==r.bytes||r.nextOffset!==(offset+bytes.length<item.bytes?offset+bytes.length:null))throw Error('Encrypted file chunk changed.');
 return {bytes,next:r.nextOffset};
}
async function saveFile(id,item,handle){
 const sink=handle?await handle.createWritable():null,chunks=[];let offset=0;
 try{
  do{const r=await chunk(id,item,offset);if(sink)await sink.write(r.bytes);else chunks.push(r.bytes);offset+=r.bytes.length;if(r.next===null)break;}while(true);
  if(sink)await sink.close();
  else{const url=URL.createObjectURL(new Blob(chunks)),a=document.createElement('a');a.href=url;a.download=item.name.split('/').pop();a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
 }catch(e){await sink?.abort();throw e;}
}
$('files').onclick=()=>guarded(async()=>{
 const id=selected,manifest=await api('/api/operations/'+id+'/files'),node=$('file-list');if(id!==selected)return;node.replaceChildren();
 text('p',manifest.files.length+' complete encrypted files. Keep their names and objects/ directory structure unchanged.',node);
 if(window.showDirectoryPicker){const all=text('button','Save complete encrypted folder',node);all.onclick=()=>guarded(async()=>{
  const target=await showDirectoryPicker({mode:'readwrite'});for(const item of manifest.files){let d=target;const parts=item.name.split('/');for(const part of parts.slice(0,-1))d=await d.getDirectoryHandle(part,{create:true});const handle=await d.getFileHandle(parts.at(-1),{create:true});await saveFile(id,item,handle);}
  msg('Complete encrypted folder saved. Keep the passphrase separate.');
 });}
 for(const item of manifest.files){
  const row=text('div','',node);row.className='files';text('code',item.name+' · '+item.bytes+' bytes · '+item.sha256,row);
  const b=text('button','Save file',row);b.onclick=()=>guarded(async()=>{let h;if(window.showSaveFilePicker)h=await showSaveFilePicker({suggestedName:item.name.split('/').pop()});else if(item.bytes>32*1024*1024)throw Error('Use the CLI/agent chunk download or a browser with streaming file saves for files over 32 MiB.');await saveFile(id,item,h);});
 }
});
await guarded(async()=>{
 await refresh();const d=draft();for(const [id,value]of Object.entries(d.fields??{}))if($(id))$(id).value=value;
 if(d.review)renderReview(d.review);
 if(d.pending){const r=await api('/api/start',d.pending);save({pending:null});await detail(r.requestId);}
 else if(d.selected)await detail(d.selected);
 msg('Ready. Review a stopped source or verify an existing encrypted handover.');
});
