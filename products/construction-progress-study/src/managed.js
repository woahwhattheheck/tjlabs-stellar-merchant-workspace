/* MIT. Complete editable draft and original pending request live together in one IndexedDB transaction. */
function createManagedSession({C,S,config,getSession,setSession,render,notice,download,isOperatorBusy=()=>false,recoveryStorage}){
 const hash=v=>S.hash(JSON.stringify(v)),copy=S.clone,key=config.installationId;let state=null,pending=null,history=[],branches=[],proposals=[],db=null,lastStored=null,ready=false,working=false,needsRefresh=false,dirtyPersistence=false,tail=Promise.resolve();
 const token=new URLSearchParams(location.hash.slice(1)).get('token')||'';historyReplace();function historyReplace(){if(location.hash)globalThis.history.replaceState(null,'',location.pathname);}
 const pane=document.getElementById('managed-controls');
 pane.innerHTML='<h2>Managed workspace</h2><p id="managed-status" role="status">Opening the selected private session…</p><div class="actions"><button id="managed-save">Save complete session</button><button id="managed-refresh">Open newest saved edition</button><button id="managed-recover">Recover original request</button><button id="managed-copy">Save complete recovery JSON</button><button id="managed-adopt-browser">Keep this browser branch; retain saved copy</button><button id="managed-export">Save retained handover ZIP</button></div><label>Open complete recovery JSON<input id="managed-receive" type="file" accept=".json"></label><div id="managed-branches"></div>';
 const status=message=>{renderBranches();document.getElementById('managed-status').textContent=message||(!ready?'Connecting…':pending?'An original save is pending. Recover it before further editing.':needsRefresh?'The save was rejected before commit. Open the newest edition; your complete local branch will be retained.':state?.carrier.sha256===S.pack(getSession()).sha256?'Complete session matches managed edition '+state.sequence+'.':'Local editable session has changes. Save it to the managed workspace.');};
 async function api(path,payload){const response=await fetch(path,{method:payload===undefined?'GET':'POST',headers:{authorization:'Bearer '+token,'x-construction-instance':config.instanceId,...(payload===undefined?{}:{'content-type':'application/json'})},body:payload===undefined?undefined:JSON.stringify(payload),redirect:'error'});const r=await response.json();if(!response.ok)throw Object.assign(Error(r.error?.message||'Managed request failed'),{code:r.error?.code});return r;}
 function shell(){return {schema:'stellar-forge.construction-recovery.v1',installationId:key,baseState:state,carrier:S.pack(getSession()),pending:copy(pending),history:copy(history),branches:copy(branches),needsRefresh};}

 function validateRecovery(value){
  if(value?.schema!=='stellar-forge.construction-recovery.v1'||value.installationId!==key||!value.baseState||!Array.isArray(value.history)||typeof value.needsRefresh!=='boolean')throw Error('Select this installation’s complete recovery JSON');
  const b=value.baseState;if(b.schema!=='stellar-forge.construction-view.v1'||b.installationId!==key||!Number.isSafeInteger(b.sequence)||b.sequence<0||!Array.isArray(b.receipts)||!Array.isArray(b.rejections))throw Error('Recovery base edition is incomplete');
  S.receive(JSON.stringify(b.carrier));
  const original={schema:'stellar-forge.construction-state.v1',installationId:b.installationId,sequence:b.sequence,carrier:b.carrier,receipts:b.receipts,rejections:b.rejections};
  if(hash(original)!==b.sha256)throw Error('Recovery base edition identity differs');
  if(value.branches!==undefined&&(!Array.isArray(value.branches)||value.branches.some(b=>!b||typeof b.id!=='string'||typeof b.reason!=='string'||!b.recovery||hash(b.recovery)!==b.sha256)))throw Error('Retained complete browser branch identity differs');
  const incoming=S.receive(JSON.stringify(value.carrier)),r=value.pending;
  if(r!==null){
   const keys=['schema','installationId','id','baseSha256','actor','at','kind','carrier'];
   if(!r||r.schema!=='stellar-forge.construction-request.v1'||r.installationId!==key||r.kind!=='save'||r.baseSha256!==b.sha256||!keys.every(k=>Object.hasOwn(r,k))||Object.keys(r).some(k=>!keys.includes(k))||typeof r.id!=='string'||!r.id||r.id.length>120||typeof r.actor!=='string'||!r.actor||r.actor.length>240||typeof r.at!=='string'||r.at.length>40||!Number.isFinite(Date.parse(r.at)))throw Error('Recovery pending request is incomplete');
   if(S.pack(S.receive(JSON.stringify(r.carrier))).sha256!==value.carrier.sha256)throw Error('Recovery editor differs from its exact pending successor');
  }
  return incoming;
 }


 function renderBranches(){
  const node=document.getElementById('managed-branches');if(!node)return;node.replaceChildren();
  if(!branches.length&&!proposals.length)return;const title=document.createElement('h3');title.textContent='Retained complete browser branches';node.append(title);
  for(const p of proposals){const row=document.createElement('p'),button=document.createElement('button');button.textContent='Save complete proposal: edition '+p.sequence+(p.pendingId?' — original request '+p.pendingId:'')+' · '+p.id.slice(0,12);button.onclick=()=>{recoveryStorage.load(db,key,p.id).then(r=>download('Construction_Progress_Study_Recovery_Proposal_'+p.id+'.json',JSON.stringify(r.value,null,2)+'\n')).catch(e=>notice(e.message,true));};row.append(button);node.append(row);}
  for(const b of branches){const row=document.createElement('p'),button=document.createElement('button');button.textContent='Save recovery JSON: '+b.reason+(b.recovery.pending?' — pending '+b.recovery.pending.id:'');button.onclick=()=>download('Construction_Progress_Study_Browser_Branch_'+b.id+'.json',JSON.stringify(b.recovery,null,2)+'\n');row.append(button);node.append(row);}
 }
 async function adoptBrowser(){
  const work=tail.then(async()=>{
   const selected=await recoveryStorage.adopt(db,key,shell(),(local,prior)=>{
    if(prior)validateRecovery(prior);const next=copy(local),all=[...(local.branches||[]),...(prior?.branches||[])],seen=new Set(all.map(b=>b.sha256));
    for(const [reason,recovery]of [['This local branch before explicit selection',local],['Other saved browser branch before explicit selection',prior]])if(recovery&&!seen.has(hash(recovery))){seen.add(hash(recovery));all.push({id:S.id(),reason,sha256:hash(recovery),recovery:copy(recovery)});}
    next.branches=all;return next;
   });
   lastStored=selected.sha256;branches=selected.value.branches;dirtyPersistence=false;proposals=await recoveryStorage.list(db,key);status();notice('This browser branch is selected. Both complete preimages and earlier proposals remain available below.');
  });tail=work.catch(()=>{});return work;
 }
 async function savedDB(value){
  const result=await recoveryStorage.save(db,key,value,lastStored);proposals=await recoveryStorage.list(db,key);
  if(result.conflict)throw Error('Another opening saved the browser head. This complete proposal is independently retained below; explicitly select this branch or receive the saved recovery.');
  lastStored=result.sha256;
 }
 function persist(){if(!ready)return Promise.resolve();dirtyPersistence=true;const work=tail.then(async()=>{const value=shell();await savedDB(value);dirtyPersistence=hash(shell())!==hash(value);status();});tail=work.catch(()=>{});return work.catch(e=>{status('Complete session remains in this tab; browser persistence needs attention: '+e.message);throw e;});}
 async function finish(result){
  if(!['COMMITTED','REJECTED_NOT_COMMITTED'].includes(result.outcome))throw Error('Original request remains unresolved');
  if(result.record.requestSha256!==hash(pending)||JSON.stringify(result.record.request)!==JSON.stringify(pending))throw Error('Original request outcome identity differs');
  history.push({requestId:pending.id,requestSha256:result.record.requestSha256,recordSha256:hash(result.record),outcome:result.outcome,sequence:result.record.sequence??null,editionSha256:result.state.sha256,error:result.record.error??null});pending=null;state=result.state;
  if(result.outcome==='COMMITTED'){setSession(S.receive(JSON.stringify(state.carrier)));needsRefresh=false;}
  else needsRefresh=true;
  await persist();render();status();notice(result.outcome==='COMMITTED'?'Complete managed session saved; original request retained.':'Save rejected before commit: '+result.record.error.message,true);
 }
 async function recover(){if(!pending)throw Error('No original request is pending');let r=await api('/api/request-status',pending);if(r.outcome==='UNRECORDED')r=await api('/api/request',pending);await finish(r);}
 async function save(){if(pending||needsRefresh)throw Error('Recover the original request or open the newest edition first');const carrier=S.pack(getSession());if(carrier.sha256===state.carrier.sha256){status();return;}
  if(!getSession().draft.actor.trim())throw Error('Enter the operation actor before saving');
  pending={schema:'stellar-forge.construction-request.v1',installationId:key,id:S.id(),baseSha256:state.sha256,actor:getSession().draft.actor.trim(),at:S.now(),kind:'save',carrier};
  await persist();status();await recover();
 }
 async function refresh(){if(pending)throw Error('Recover the original request first');const next=await api('/api/state');const local=getSession(),fresh=S.receive(JSON.stringify(next.carrier));setSession(S.pack(local).sha256===next.carrier.sha256?fresh:S.replace(local,fresh,'Complete local branch before opening newest managed edition'));state=next;needsRefresh=false;await persist();render();status();notice('Newest saved edition opened. The complete prior local branch is retained in Open and restore.');}
 async function retainedExport(){if(pending||needsRefresh||S.pack(getSession()).sha256!==state.carrier.sha256)throw Error('Save the complete current session before exporting its retained managed edition');const file=await api('/api/export',{expectedSha256:state.sha256}),parts=[];let offset=0;
  for(;;){const r=await api('/api/file?id='+file.fileId+'&offset='+offset+'&limit=196608');if(r.sha256!==file.sha256||r.bytes!==file.bytes||r.offset!==offset)throw Error('Retained export identity changed');const b=C.fromBase64(r.contentBase64);parts.push(b);offset+=b.length;if(r.nextOffset===null)break;if(r.nextOffset!==offset||!b.length)throw Error('Retained export continuation changed');}
  const bytes=new Uint8Array(offset);let at=0;for(const p of parts){bytes.set(p,at);at+=p.length;}if(offset!==file.bytes||C.sha256Bytes(bytes)!==file.sha256)throw Error('Complete retained export differs');download('Construction_Progress_Study_Managed_Handover.zip',bytes,'application/zip');notice('Complete retained handover downloaded.');
 }
 function run(fn){if(working)return;if(isOperatorBusy()){notice('Wait for the current operator action before saving or receiving.',true);return;}if(!ready){notice('Open the current private connection before managed actions.',true);return;}working=true;status('Working with the original saved edition…');Promise.resolve().then(fn).catch(e=>notice(e.message,true)).finally(()=>{working=false;status();});}
 document.getElementById('managed-adopt-browser').onclick=()=>run(adoptBrowser);
 document.getElementById('managed-save').onclick=()=>run(save);document.getElementById('managed-refresh').onclick=()=>run(refresh);document.getElementById('managed-recover').onclick=()=>run(recover);document.getElementById('managed-export').onclick=()=>run(retainedExport);
 document.getElementById('managed-copy').onclick=()=>download('Construction_Progress_Study_Recovery.json',JSON.stringify(shell(),null,2)+'\n');
 document.getElementById('managed-receive').onchange=e=>run(async()=>{const file=e.target.files[0];if(!file)return;if(file.size>256*1024*1024)throw Error('Recovery file exceeds the complete limit');const originalBytes=new Uint8Array(await file.arrayBuffer()),originalText=C.utf8Decode(originalBytes);if(C.toBase64(C.utf8Encode(originalText))!==C.toBase64(originalBytes))throw Error('Select exact UTF-8 recovery JSON');const received=JSON.parse(originalText);const incoming=validateRecovery(received);if(pending&&JSON.stringify(pending)!==JSON.stringify(received.pending))throw Error('Recover the current original request before opening a different one');if(received.pending&&(received.pending.installationId!==key||received.pending.baseSha256!==received.baseState.sha256))throw Error('Recovery request binding differs');history.push({localRecoveryBeforeReceive:shell()});state=received.baseState;pending=received.pending;history.push(...received.history);branches.push(...(received.branches||[]));needsRefresh=!!received.needsRefresh;setSession(incoming);await persist();render();status();notice('Complete recovery opened; recover its exact original request or select the newest managed edition.');});
 for(const event of ['click','input','change'])document.addEventListener(event,e=>{if((!ready||pending||working)&&!pane.contains(e.target)){e.preventDefault();e.stopImmediatePropagation();notice('Wait for connection or recover the original managed request before editing.',true);}},true);
 window.addEventListener('beforeunload',e=>{if(pending||dirtyPersistence||ready&&state.carrier.sha256!==S.pack(getSession()).sha256){e.preventDefault();e.returnValue='';}});
 async function initialize(){
  if(!/^[a-f0-9]{64}$/.test(token))throw Error('Open the current private Applications link');
  db=await recoveryStorage.open();
  const selected=await recoveryStorage.read(db,key),prior=selected.value;proposals=await recoveryStorage.list(db,key);
  const current=await api('/api/state');if(current.installationId!==key)throw Error('The managed installation identity changed');
  lastStored=prior?hash(prior):null;
  if(prior){validateRecovery(prior);state=prior.baseState;pending=prior.pending;history=prior.history;branches=prior.branches||[];needsRefresh=!!prior.needsRefresh;setSession(S.receive(JSON.stringify(prior.carrier)));if(!pending&&state.sha256!==current.sha256)needsRefresh=true;}
  else{state=current;setSession(S.receive(JSON.stringify(current.carrier)));}
  ready=true;render();status();if(pending)notice('An exact original request is pending. Recover it with the current listener.');
 }
 initialize().catch(e=>{status('Managed connection needs attention: '+e.message);notice(e.message,true);});
 return {persist:()=>persist().catch(e=>notice(e.message,true)),status,export:retainedExport,isManaged:true};
}
