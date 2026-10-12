const $=id=>document.getElementById(id);
const tabs=[['overview','Overview'],['orders','Orders'],['payments','Payments'],['sources','Source capture'],['reports','Reports'],['requests','Requests'],['workspace','Workspace']];
const profileTypes=['merchant-key-v2','checkout-mpp-0.1.21','intent-common-0.1.43','rozo-testnet-v1'];
const statuses=['payment_unpaid','payment_started','payment_payin_completed','payment_payout_completed','payment_completed','payment_bounced','payment_expired','payment_refunded'];
let selected=sessionStorage.getItem('rozo-profile')??'',tab='overview',state=null,renderGeneration=0,dialogGeneration=0,fileGeneration=0,pendingFile=null,filter={query:'',status:'',unresolved:false,offset:0},loading=false;
const running=new Map();
let token=new URLSearchParams(location.hash.slice(1)).get('session')??sessionStorage.getItem('rozo-session');
if(token){sessionStorage.setItem('rozo-session',token);if(location.hash)history.replaceState(null,'',location.pathname+location.search);}
function el(tag,attributes={},children=[]){const node=document.createElement(tag);for(const [key,value]of Object.entries(attributes)){if(key==='class')node.className=value;else if(key==='text')node.textContent=value;else if(key.startsWith('on'))node.addEventListener(key.slice(2),value);else if(value!==null&&value!==undefined&&value!==false){if(key in node)node[key]=value;else node.setAttribute(key,String(value));}}for(const child of [children].flat(Infinity)){if(child!==null&&child!==undefined)node.append(child instanceof Node?child:document.createTextNode(String(child)));}return node;}
const fmt=n=>new Intl.NumberFormat('en-US').format(n??0);
const short=value=>value&&value.length>30?value.slice(0,15)+'…'+value.slice(-9):value??'—';
const date=value=>value?new Date(value).toISOString().replace('T',' ').replace('.000Z',' UTC'):'—';
const uid=prefix=>prefix+'-'+crypto.randomUUID();
const canon=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?'['+value.map(canon).join(',')+']':'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canon(value[k])).join(',')+'}';
async function hash(text){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',typeof text==='string'?new TextEncoder().encode(text):text))].map(v=>v.toString(16).padStart(2,'0')).join('');}
const display=value=>value===null||value===undefined?'—':typeof value==='object'?JSON.stringify(value):String(value);
function notify(message,error=false){$('notice').replaceChildren(message?el('div',{class:'notice'+(error?' error':''),text:message}):document.createDocumentFragment());}
function button(label,action,kind='secondary',attrs={}){const b=el('button',{type:'button',class:kind,text:label,...attrs});b.addEventListener('click',async()=>{if(b.disabled)return;b.disabled=true;try{await action();}catch(e){notify(e.message,true);}finally{b.disabled=false;}});return b;}
function badge(text,kind=''){return el('span',{class:'badge '+kind,text});}
function card(title,children,action){return el('section',{class:'card'},[title?el('div',{class:'card-head'},[el('h2',{text:title}),action]):null,children]);}
function empty(title,message){return el('div',{class:'empty'},[el('strong',{text:title}),message]);}
function table(head,rows){return el('div',{class:'table-wrap'},el('table',{},[el('thead',{},el('tr',{},head.map(h=>el('th',{text:h})))),el('tbody',{},rows.map(row=>el('tr',{},row.map(v=>el('td',{},v)))))]));}
function json(value){return el('pre',{text:JSON.stringify(value,null,2)});}
function field(label,name,value='',{type='text',choices,required=false,hint,wide=false,...extra}={}){
  let input;if(choices){input=el('select',{name,required,...extra},choices.map(c=>el('option',{value:Array.isArray(c)?c[0]:c,text:Array.isArray(c)?c[1]:c})));input.value=value??'';}
  else if(type==='textarea')input=el('textarea',{name,value:value??'',required,...extra});
  else input=el('input',{type,name,value:value??'',required,...extra});
  return el('label',{class:'field'+(wide?' wide':'')},[label,input,hint?el('small',{text:hint}):null]);
}
function check(label,name,value=false){return el('label',{class:'check'},[el('input',{type:'checkbox',name,checked:value}),label]);}
function input(form,name){return form.elements.namedItem(name)?.value??'';}
function number(form,name){const value=input(form,name);if(!/^\d+$/.test(value))throw Error(name+' must be a whole nonnegative number.');return Number(value);}
function selectedProfile(){return state?.selected?.value??null;}
function invalidateFile(){fileGeneration++;pendingFile=null;}
function showDialog(title,body){dialogGeneration++;invalidateFile();$('dialog-title').textContent=title;$('dialog-body').replaceChildren(body);if(!$('dialog').open)$('dialog').showModal();return dialogGeneration;}
function closeDialog(){dialogGeneration++;invalidateFile();$('dialog').close();}
$('dialog-close').onclick=closeDialog;$('dialog').addEventListener('cancel',()=>{dialogGeneration++;invalidateFile();});
async function api(path,{method='GET',value,signal}={}){
  const response=await fetch(path,{method,headers:{'X-Rozo-Session':token??'',...(value!==undefined?{'Content-Type':'application/json'}:{})},body:value===undefined?undefined:JSON.stringify(value),signal,cache:'no-store'});
  const result=await response.json();if(!response.ok){const e=new Error(result.error?.message??'The operator did not return a completed response.');e.code=result.error?.code;e.details=result.error?.details;e.status=response.status;throw e;}return result;
}
const database=new Promise((resolve,reject)=>{const request=indexedDB.open('rozo-original-requests',1);request.onupgradeneeded=()=>request.result.createObjectStore('requests',{keyPath:'key'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
async function putRecord(value){const db=await database;return new Promise((resolve,reject)=>{const tx=db.transaction('requests','readwrite');tx.objectStore('requests').put(value);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
async function getRecord(key){const db=await database;return new Promise((resolve,reject)=>{const r=db.transaction('requests').objectStore('requests').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function allRecords(){const db=await database;return new Promise((resolve,reject)=>{const r=db.transaction('requests').objectStore('requests').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function key(envelope){return envelope.workspaceId+':'+envelope.requestId;}
async function verifyRecord(record){
  const parsed=JSON.parse(record.bodyText);
  if(canon(parsed)!==canon(record.envelope)||await hash(canon(parsed))!==record.fingerprint||record.key!==key(parsed))throw Error('The retained original request bytes differ. Preserve this record for review.');
  return parsed;
}
function bindResult(record,result){
  if(result.workspaceId!==record.envelope.workspaceId||result.requestId!==record.envelope.requestId||result.fingerprint!==record.fingerprint)throw Error('The original request response belongs to another input or workspace.');
}
async function retainAccepted(record,result){
  bindResult(record,result);const latest=await getRecord(record.key);if(latest?.state==='accepted'&&latest.result?.revision!==result.revision)throw Error('The accepted original request revision changed.');
  if(latest?.state==='accepted')return latest.result;
  const needsExport=record.envelope.command.startsWith('workspace.')&&!result.delivery;
  await putRecord({...record,state:needsExport?'export_pending':'accepted',uncertain:false,result,updatedAt:new Date().toISOString()});
  return result;
}
async function invokeRecord(record,{resume=false,retry=false}={}){
  if(running.has(record.key))return running.get(record.key);
  const task=(async()=>{
    await verifyRecord(record);
    const current=await getRecord(record.key)??record;
    if(current.state==='accepted')return current.result;
    const priorUncertain=current.uncertain===true||(current.attempts??0)>0;
    const attempt=(current.attempts??0)+1,prepared={...current,attempts:attempt,uncertain:true,state:'pending',updatedAt:new Date().toISOString()};
    await putRecord(prepared);await renderRecovery();
    try{
      const result=await api(resume?'/api/requests/'+encodeURIComponent(record.envelope.requestId)+'/resume':'/api/commands',{method:'POST',value:resume?(retry?{retry:true}:{}):JSON.parse(record.bodyText)});
      if(result.state==='pending'){if(result.workspaceId!==record.envelope.workspaceId||result.requestId!==record.envelope.requestId)throw Error('The pending result has another original identity.');notify(result.reason??'The original operation remains pending. Reconcile its retained request.');return result;}
      await retainAccepted(prepared,result);notify(result.delivery?'The full original workspace archive is ready.':'The original operation is retained at revision '+result.revision+'.');return result;
    }catch(error){
      const latest=await getRecord(record.key);
      if(latest?.state==='accepted')return latest.result;
      if(!priorUncertain&&error.details?.requestState==='rejected'&&latest?.attempts===attempt)await putRecord({...prepared,state:'rejected',uncertain:false,error:{code:error.code,message:error.message}});
      else if(latest?.attempts===attempt)await putRecord({...prepared,error:{code:error.code??'RESPONSE_UNCERTAIN',message:error.message}});
      throw error;
    }finally{await renderRecovery();}
  })().finally(()=>running.delete(record.key));running.set(record.key,task);return task;
}
async function command(command,payload,expectedRevision=state.workspace.revision){
  const envelope={workspaceId:state.workspace.workspaceId,requestId:uid('request'),expectedRevision,actor:$('actor').value.trim()||'Operator',command,payload};
  const record={key:key(envelope),envelope,bodyText:JSON.stringify(envelope),fingerprint:await hash(canon(envelope)),attempts:0,uncertain:false,state:'prepared',createdAt:new Date().toISOString()};
  await putRecord(record);const result=await invokeRecord(record);await refresh();return result;
}
async function reconcile(record,{resume=false,retry=false}={}){
  await verifyRecord(record);
  const status=await api('/api/requests/'+encodeURIComponent(record.envelope.requestId));
  if(status.workspaceId!==record.envelope.workspaceId||status.requestId!==record.envelope.requestId)throw Error('The request status names another original workspace.');
  if(status.state!=='not_found'){
    if(canon(status.request?.envelope)!==canon(record.envelope)||status.fingerprint!==record.fingerprint)throw Error('The server retained another original request. Keep the local bytes for review.');
    if(status.state==='accepted'&&!record.envelope.command.startsWith('workspace.')){await retainAccepted(record,status.result);await refresh();return status.result;}
    if(status.state==='accepted'&&record.envelope.command.startsWith('workspace.')){
      try{const delivery=await api('/api/deliveries/'+encodeURIComponent(record.envelope.payload.id));await retainAccepted(record,{...status.result,delivery});await refresh();return status.result;}
      catch(e){if(e.code!=='DELIVERY_PENDING')throw e;await putRecord({...record,state:'export_pending',uncertain:false,result:status.result});}
    }
  }
  if(resume){
    // Exact stored server metadata enables native continuation. An absent server intent
    // can only receive the complete originally retained POST bytes.
    const result=await invokeRecord(record,{resume:status.state!=='not_found',retry});await refresh();return result;
  }
  notify(status.state==='not_found'?'This read did not find the original request. Its earlier uncertain send remains retained.':status.state==='accepted'?'The original handover is sealed; finish the same archive assembly.':'The original intent is retained and can continue with the same request ID.');await renderRecovery();
}
async function adoptPending(requestId,run=false,retry=false){
  const status=await api('/api/requests/'+encodeURIComponent(requestId));
  if(status.workspaceId!==state.workspace.workspaceId||status.requestId!==requestId||!status.request?.envelope)throw Error('The complete original request is not available from this workspace.');
  const envelope=status.request.envelope,fp=await hash(canon(envelope));if(fp!==status.fingerprint)throw Error('The original server request hash differs.');
  let record=await getRecord(key(envelope));
  if(!record){record={key:key(envelope),envelope,bodyText:JSON.stringify(envelope),fingerprint:fp,attempts:status.request.attempts?.length??0,uncertain:status.state!=='accepted',state:'pending',createdAt:status.request.createdAt,retainedFromServer:true};await putRecord(record);}
  return reconcile(record,{resume:run,retry});
}
async function renderRecovery(){
  if(!state)return;const generation=renderGeneration,workspaceId=state.workspace.workspaceId;
  const local=(await allRecords()).filter(r=>r.envelope.workspaceId===workspaceId&&!['accepted','rejected'].includes(r.state));
  if(generation!==renderGeneration||state.workspace.workspaceId!==workspaceId)return;
  const known=new Set(local.map(r=>r.envelope.requestId)),server=(state.pending??[]).filter(r=>!known.has(r.id));
  if(!local.length&&!server.length){$('recovery').replaceChildren();return;}
  const items=local.map(r=>el('div',{class:'item','data-request-id':r.envelope.requestId},[el('div',{},[el('strong',{text:r.envelope.command}),el('small',{class:'mono',text:r.envelope.requestId}),el('small',{text:(r.state==='export_pending'?'Original source prepared; archive pending':r.uncertain?'Response unresolved':'Prepared original input')+' · '+r.envelope.actor}),r.error?el('small',{text:r.error.message}):null]),el('div',{class:'actions'},[button('Check original status',()=>reconcile(r),'secondary',{'data-action':'request-check'}),button(r.state==='export_pending'?'Finish prepared archive':'Resume original request',()=>reconcile(r,{resume:true}),'',{'data-action':'request-resume'}),['merchant.create','merchant.register'].includes(r.envelope.command)?button('Review provider retry',()=>reviewRetry(r),'ghost'):null,button('Original input',()=>showDialog('Retained original request',json(r)),'ghost')])]));
  items.push(...server.map(r=>el('div',{class:'item'},[el('div',{},[el('strong',{text:r.command}),el('small',{class:'mono',text:r.id}),el('small',{text:'Original server intent · '+r.actor})]),el('div',{class:'actions'},[button('Read original request',()=>adoptPending(r.id),'secondary'),button('Continue prepared operation',()=>adoptPending(r.id,true),'')])])));
  $('recovery').replaceChildren(el('section',{class:'card recovery-card'},[el('h2',{text:'Original operations to reconcile'}),el('p',{class:'muted',text:'These exact requests survive a lost response or a browser reload. Continue their original identities after reading the retained state.'}),items]));
}
function reviewRetry(record){
  const approved=check('I reviewed the latest original provider lookup and want to retry the same retained POST.','approved');
  const action=button('Retry same original provider request',async()=>{if(!approved.querySelector('input').checked)throw Error('Review and select the explicit same-request retry.');closeDialog();await reconcile(record,{resume:true,retry:true});},'danger');
  showDialog('Review original provider retry',[el('p',{text:'An absent lookup does not prove the earlier provider create or transaction registration failed. This action retains the same original app/order or transaction fields.'}),json(record.envelope),approved,el('div',{class:'form-actions'},action)]);
}
async function refresh(){
  const generation=++renderGeneration;invalidateFile();loading=true;
  const profile=selected,q=new URLSearchParams({offset:String(filter.offset),limit:'100',query:filter.query,status:filter.status,unresolved:String(filter.unresolved)});if(profile)q.set('profileId',profile);
  try{const next=await api('/api/state?'+q);if(generation!==renderGeneration)return;
    state=next;if(selected&&!next.profiles.some(p=>p.value.id===selected)){selected='';return refresh();}
    $('profile').replaceChildren(el('option',{value:'',text:'Select a profile'}),...next.profiles.map(p=>el('option',{value:p.value.id,text:p.value.label})));$('profile').value=selected;
    $('connection-state').textContent=next.control.mode==='sealed'?'Original sender sealed':'Original workspace connected';$('workspace-label').textContent=(selectedProfile()?.label??'Merchant workspace')+' · revision '+next.workspace.revision;
    $('footer').textContent='Workspace '+next.workspace.workspaceId+' · Origin '+next.workspace.originId+' · Source '+short(next.sourceIdentity?.selectionSha256);
    render();await renderRecovery();
  }catch(error){if(generation===renderGeneration)notify(error.message,true);}finally{if(generation===renderGeneration)loading=false;}
}
function navigate(value){tab=value;filter.offset=0;closeDialog();renderGeneration++;invalidateFile();render();renderRecovery();}
function render(){
  $('page-title').textContent=tabs.find(t=>t[0]===tab)?.[1]??'Workspace';
  $('navigation').replaceChildren(...tabs.map(([id,title],i)=>button('',()=>navigate(id),'',{'aria-current':id===tab?'page':null})).map((b,i)=>{b.append(el('span',{class:'number',text:String(i+1).padStart(2,'0')}),tabs[i][1]);return b;}));
  if(!state){$('page').replaceChildren(empty('Opening the retained workspace','Use the private startup link to connect.'));return;}
  const pages={overview:overviewPage,orders:ordersPage,payments:paymentsPage,sources:sourcesPage,reports:reportsPage,requests:requestsPage,workspace:workspacePage};
  $('page').replaceChildren(pages[tab]());
}
function requireProfile(){return selectedProfile()||null;}
function profilePrompt(){return card('Original merchant profile',empty('Select the original merchant profile','Create or select the app, host connection and actual asset/network definitions before operating payments.'),button('Add profile',()=>editProfile(),''));}
function metric(label,value,note){return el('div',{class:'metric'},[el('small',{text:label}),el('strong',{text:fmt(value)}),el('p',{text:note})]);}
function overviewPage(){
  const p=requireProfile();if(!p)return el('div',{},[card('Original merchant profiles',state.profiles.length?table(['Profile','Original source','App / host',''],state.profiles.map(r=>[el('strong',{text:r.value.label}),badge(r.value.type),[el('div',{class:'mono',text:r.value.appId??'Native invoice profile'}),el('small',{text:r.value.connection})],button('Open',async()=>{selected=r.value.id;sessionStorage.setItem('rozo-profile',selected);await refresh();},'ghost')])):empty('Start with a merchant profile','Use an already configured host connection and the exact original app identity.'),button('Add profile',()=>editProfile(),'')),workspaceSummary()]);
  const items=state.payments.items;
  return el('div',{},[el('p',{class:'title-note',text:'Review source payment, destination payout, merchant settlement and fulfilment separately. Original observations and corrections remain available across every capture.'}),el('div',{class:'metrics'},[metric('Retained payments',state.payments.total,'Full selected profile'),metric('Differences on this page',items.filter(r=>r.unresolved.length).length,'Original source and reviewed decisions'),metric('Saved reports',state.reports.length,'Immutable period editions'),metric('Pending operations',state.pending.filter(r=>r.profileId===p.id).length,'Original request identities')]),card('Merchant and source',el('div',{class:'grid'},[el('div',{},[el('h3',{text:p.label}),badge(p.type),el('p',{class:'mono',text:p.appId??'Native invoice source'}),el('p',{class:'muted',text:'Host connection: '+p.connection})]),el('div',{},[el('h3',{text:'Selected assets'}),...p.assets.map(a=>el('p',{class:'muted',text:a.tokenSymbol+' · '+a.network+' · '+a.decimals+' decimals'}))]),el('div',{},[el('h3',{text:'Operator actions'}),el('div',{class:'stack'},[button('Review orders',()=>navigate('orders')),button('Capture original source',()=>navigate('sources')),button('Save period report',()=>editReport())])])]),button('Edit profile',()=>editProfile(state.selected),'ghost')),card('Recent original payments',paymentTable(items.slice(0,8)),button('All payments',()=>navigate('payments'),'ghost'))]);
}
function profileFields(existing={}){
  const values=existing.assets??[{chainId:'',network:'',tokenSymbol:'',tokenAddress:'',decimals:6}],assets=el('div',{class:'wide',id:'asset-rows'}),form=el('form',{id:'profile-form'});
  const addAsset=(a={})=>{const row=el('div',{class:'asset-row'},[...['chainId','network','tokenSymbol','tokenAddress','decimals'].map(k=>el('input',{name:'asset-'+k,value:a[k]??'',placeholder:({chainId:'Chain ID',network:'Actual network',tokenSymbol:'Symbol',tokenAddress:'Token address / native',decimals:'Decimals'})[k],required:true,ariaLabel:k,type:k==='decimals'?'number':'text',min:k==='decimals'?0:undefined,max:k==='decimals'?36:undefined})),button('Remove',()=>row.remove(),'ghost')]);assets.append(row);};
  values.forEach(addAsset);
  const connections=state.connections.filter(c=>c.type!=='stellar-rpc');
  const provider=existing.type??connections[0]?.type??profileTypes[0];
  form.append(el('div',{class:'form-grid'},[
    field('Profile ID','id',existing.id??uid('merchant'),{required:true,readOnly:Boolean(existing.id)}),field('Profile name','label',existing.label??'',{required:true}),
    field('Original provider profile','type',provider,{choices:profileTypes,required:true,disabled:Boolean(existing.id)}),
    field('Host connection','connection',existing.connection??connections[0]?.alias??'',{choices:connections.map(c=>[c.alias,c.alias+' · '+c.type]),required:true,disabled:Boolean(existing.id)}),
    field('Original app ID','appId',existing.appId??'',{hint:'Required for keyed merchant orders; use the observed host app binding.'}),
    field('Notes','notes',existing.notes??'',{type:'textarea',wide:true})
  ]),el('p',{class:'section-label',text:'Actual asset and network definitions'}),el('p',{class:'muted',text:'Use the original token address (or native sentinel), actual network and observed precision. Chain ID alone does not identify a testnet.'}),assets,button('Add asset',()=>addAsset(),'ghost'));
  const stellar=existing.stellar??{};
  form.append(el('details',{},[el('summary',{text:'Stellar contract source'}),el('div',{class:'form-grid'},[
    field('Contract profile','stellarProfile',stellar.profile??'',{choices:[['','No Stellar capture'],['rozo-payment-v1','V1 payment'],['rozo-forwarder-v2','V2 forwarder'],['rozo-intent-bridge-v2','V2 intent bridge']]}),
    field('RPC connection alias','stellarConnection',stellar.connection??'',{choices:[['','Select RPC connection'],...state.connections.filter(c=>c.type==='stellar-rpc').map(c=>[c.alias,c.alias])]}),
    field('Actual network passphrase','networkPassphrase',stellar.networkPassphrase??'',{wide:true}),
    field('Original deployed contract ID','contractId',stellar.contractId??'',{wide:true}),field('First retained ledger','startLedger',stellar.startLedger??'',{type:'number'})
  ])]));
  const wallet=existing.wallet??{};
  form.append(el('details',{},[el('summary',{text:'Observed merchant settlement wallet'}),el('div',{class:'form-grid'},[
    field('Chain ID','walletChainId',wallet.chainId??''),field('Actual network','walletNetwork',wallet.network??''),field('Token address','walletToken',wallet.tokenAddress??'',{wide:true}),
    field('Merchant address','walletAddress',wallet.address??'',{wide:true}),field('Required memo','walletMemo',wallet.memo??''),field('Wallet source reference','walletSource',wallet.sourceRef??'')
  ])]));
  return form;
}
function editProfile(record){
  const existing=record?.value??{},revision=state.workspace.revision,form=profileFields(existing);
  form.append(el('div',{class:'form-actions'},el('button',{type:'submit',text:'Save merchant profile'})));
  form.onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{
    const assets=[...form.querySelectorAll('.asset-row')].map(r=>Object.fromEntries(['chainId','network','tokenSymbol','tokenAddress','decimals'].map(k=>[k,k==='decimals'?Number(r.querySelector('[name=asset-'+k+']').value):r.querySelector('[name=asset-'+k+']').value])));
    const p={id:input(form,'id'),label:input(form,'label'),type:input(form,'type'),connection:input(form,'connection'),assets};
    if(input(form,'appId'))p.appId=input(form,'appId');if(input(form,'notes'))p.notes=input(form,'notes');
    if(input(form,'stellarProfile'))p.stellar={profile:input(form,'stellarProfile'),connection:input(form,'stellarConnection'),networkPassphrase:input(form,'networkPassphrase'),contractId:input(form,'contractId'),startLedger:number(form,'startLedger')};
    if(input(form,'walletAddress'))p.wallet={chainId:input(form,'walletChainId'),network:input(form,'walletNetwork'),tokenAddress:input(form,'walletToken'),address:input(form,'walletAddress'),sourceRef:input(form,'walletSource'),...(input(form,'walletMemo')?{memo:input(form,'walletMemo')}:{})};
    const result=await command('profile.save',p,revision);if(result.state!=='pending'){selected=p.id;sessionStorage.setItem('rozo-profile',selected);closeDialog();await refresh();}
  }catch(e){notify(e.message,true);}finally{b.disabled=false;}};
  showDialog(record?'Edit original profile':'Add merchant profile',form);
}

function assetChoice(form,name,p,selectedAsset){
  return field(name==='sourceAsset'?'Source asset':'Destination asset',name,selectedAsset??'0',{choices:p.assets.map((a,i)=>[String(i),a.tokenSymbol+' · '+a.network+' · '+a.chainId]),required:true});
}
function ordersPage(){
  const p=requireProfile();if(!p)return profilePrompt();
  return el('div',{},[el('p',{class:'title-note',text:'Retain the original app/order identity and exact expected amount before creation. Each native profile uses its own original provider method.'}),card('Original orders',state.orders.length?table(['Original order','Expected source','Destination / fulfilment','Native action'],state.orders.map(r=>{
    const o=r.value,create=p.type==='merchant-key-v2'?'merchant.create':p.type==='checkout-mpp-0.1.21'?'checkout.create':p.type==='intent-common-0.1.43'?'sdk.create':null;
    return [[el('strong',{text:o.title}),el('small',{class:'mono',text:o.orderId}),button('Edit',()=>editOrder(r),'ghost'),button('History',()=>showHistory('order',o.id),'ghost')],[o.source.amount+' '+o.source.tokenSymbol,el('small',{text:'Chain '+o.source.chainId})],[o.expectedDestination?.amount??'—',el('small',{text:o.fulfilmentRef??o.checkout?.url??'No fulfilment source selected'})],el('div',{class:'stack'},[create?button('Prepare & create',()=>confirmCreate(o,create),''):badge('Read-only provider'),p.type==='checkout-mpp-0.1.21'?button('Original quote',()=>command('checkout.quote',{profileId:p.id,orderId:o.id}),'secondary'):null,p.type==='intent-common-0.1.43'?button('Original fee quote',()=>command('sdk.fee',{profileId:p.id,orderId:o.id}),'secondary'):null])];
  })):empty('No original orders yet','Save the actual order identity and asset before preparing its native request.'),el('div',{class:'row'},[p.type==='merchant-key-v2'?button('Import CSV',()=>importOrders()):null,button('Add order',()=>editOrder(),'')])),card('Inspect an existing original payment',nativeSelectionForm(p))]);
}
function editOrder(record){
  const p=selectedProfile(),o=record?.value??{},revision=state.workspace.revision,form=el('form'),sourceIndex=Math.max(0,p.assets.findIndex(a=>a.chainId===o.source?.chainId&&a.tokenSymbol===o.source?.tokenSymbol)),destIndex=Math.max(0,p.assets.findIndex(a=>a.chainId===o.expectedDestination?.chainId&&a.tokenSymbol===o.expectedDestination?.tokenSymbol));
  form.append(el('div',{class:'form-grid'},[
    field('Internal retained ID','id',o.id??uid('order'),{required:true,readOnly:Boolean(o.id)}),field('Original app order ID','orderId',o.orderId??'',{required:true}),
    field('Order title','title',o.title??'',{required:true,wide:true}),assetChoice(form,'sourceAsset',p,String(sourceIndex)),
    field('Expected source amount','amount',o.source?.amount??'',{required:true,inputMode:'decimal',hint:'Exact decimal text; amounts are never rounded through binary floating point.'}),
    field('Fulfilment source reference','fulfilmentRef',o.fulfilmentRef??'',{wide:true})
  ]));
  const destination=check('Retain an explicit expected destination','hasDestination',Boolean(o.expectedDestination)||p.type==='intent-common-0.1.43');
  form.append(destination,el('div',{class:'form-grid'},[assetChoice(form,'destAsset',p,String(destIndex)),field('Expected destination amount','destAmount',o.expectedDestination?.amount??'',{inputMode:'decimal'}),field('Destination address','receiverAddress',o.expectedDestination?.receiverAddress??'',{wide:true}),field('Required memo','receiverMemo',o.expectedDestination?.receiverMemo??'')]));
  if(p.type==='checkout-mpp-0.1.21')form.append(el('p',{class:'section-label',text:'Original Coinbase Checkout invoice'}),el('div',{class:'form-grid'},[field('Original invoice URL or link ID','checkoutUrl',o.checkout?.url??'',{required:true,wide:true}),field('Original payer email','email',o.checkout?.email??'',{type:'email'}),field('Attribution source','utmSource',o.checkout?.utmSource??'')]));
  form.append(field('Operator notes','notes',o.notes??'',{type:'textarea',wide:true}),el('div',{class:'form-actions'},el('button',{type:'submit',text:'Save original order'})));
  form.onsubmit=async e=>{e.preventDefault();e.submitter.disabled=true;try{
    const a=p.assets[number(form,'sourceAsset')],d=p.assets[number(form,'destAsset')],value={id:input(form,'id'),profileId:p.id,orderId:input(form,'orderId'),title:input(form,'title'),source:{chainId:a.chainId,tokenSymbol:a.tokenSymbol,amount:input(form,'amount')}};
    if(form.elements.hasDestination.checked)value.expectedDestination={chainId:d.chainId,tokenSymbol:d.tokenSymbol,tokenAddress:d.tokenAddress,...(input(form,'destAmount')?{amount:input(form,'destAmount')}:{}) ,...(input(form,'receiverAddress')?{receiverAddress:input(form,'receiverAddress')}:{}) ,...(input(form,'receiverMemo')?{receiverMemo:input(form,'receiverMemo')}:{})};
    if(input(form,'fulfilmentRef'))value.fulfilmentRef=input(form,'fulfilmentRef');if(input(form,'notes'))value.notes=input(form,'notes');
    if(p.type==='checkout-mpp-0.1.21')value.checkout={url:input(form,'checkoutUrl'),provider:'coinbase',...(input(form,'email')?{email:input(form,'email')}:{}) ,...(input(form,'utmSource')?{utmSource:input(form,'utmSource')}:{})};
    const r=await command('order.save',value,revision);if(r.state!=='pending')closeDialog();
  }catch(e){notify(e.message,true);}finally{e.submitter.disabled=false;}};
  showDialog(record?'Edit original order':'Add original order',form);
}
function confirmCreate(order,kind){
  const p=selectedProfile(),revision=state.workspace.revision,approved=check('I reviewed this original order and want to create its provider payment.','reviewed');
  showDialog('Prepare original payment',[el('p',{text:'The workspace retains the complete request before contacting '+p.type+'. If a reply is lost, use its original request and lookup. This action does not submit a wallet transaction.'}),table(['Order','Expected source','Original provider'],[[order.orderId,order.source.amount+' '+order.source.tokenSymbol,p.type]]),approved,el('div',{class:'form-actions'},button('Create original payment',async()=>{if(!approved.querySelector('input').checked)throw Error('Review the original order before creating its payment.');closeDialog();await command(kind,{profileId:p.id,orderId:order.id},revision);},''))]);
}
async function fileDescriptor(file){
  if(file.size>32*1024*1024)throw Error('Select a source file no larger than 32 MiB.');const bytes=new Uint8Array(await file.arrayBuffer());let encoded='';for(let i=0;i<bytes.length;i+=24576)encoded+=btoa(String.fromCharCode(...bytes.subarray(i,i+24576)));return {name:file.name,bytes:bytes.length,sha256:await hash(bytes),base64:encoded};
}
function csvHeaders(text){
  const headers=[];let value='',quoted=false;
  for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}else if(!quoted&&(c===','||c==='\n'||c==='\r')){headers.push(value);value='';if(c!==',')return headers;}else value+=c;}headers.push(value);return headers;
}
function importOrders(){
  const p=selectedProfile(),revision=state.workspace.revision,form=el('form'),file=field('Original UTF-8 CSV','file','',{type:'file',accept:'.csv,text/csv',required:true,wide:true}),mapping=el('div',{class:'form-grid'}),note=el('p',{class:'muted',text:'Select the complete source file. Column names are mapped explicitly.'}),submit=el('button',{type:'submit',text:'Receive original orders',disabled:true});
  form.append(file,note,mapping,el('div',{class:'form-actions'},submit));const generation=showDialog('Import original merchant orders',form);
  file.querySelector('input').onchange=async e=>{invalidateFile();submit.disabled=true;const current=++fileGeneration,selectedFile=e.target.files[0];if(!selectedFile)return;try{const raw=await fileDescriptor(selectedFile),text=await selectedFile.text();if(current!==fileGeneration||generation!==dialogGeneration)return;pendingFile=raw;const headers=csvHeaders(text.replace(/^\uFEFF/,''));mapping.replaceChildren(...['orderId','title','chainId','tokenSymbol','amount','fulfilmentRef'].map(k=>field(k,k,headers.includes(k)?k:'',{choices:[['','Select original column'],...headers.map(h=>[h,h])],required:k!=='fulfilmentRef'})));note.textContent=fmt(raw.bytes)+' original bytes · SHA-256 '+raw.sha256;submit.disabled=false;}catch(error){notify(error.message,true);}};
  form.onsubmit=async e=>{e.preventDefault();if(!pendingFile||generation!==dialogGeneration){notify('Select and finish reading the original file.',true);return;}const original=pendingFile;submit.disabled=true;try{const columns=Object.fromEntries(['orderId','title','chainId','tokenSymbol','amount','fulfilmentRef'].filter(k=>input(form,k)).map(k=>[k,input(form,k)]));const r=await command('orders.import',{profileId:p.id,file:original,columns},revision);if(r.state!=='pending')closeDialog();}catch(error){notify(error.message,true);}finally{submit.disabled=false;}};
}
function nativeSelectionForm(p){
  const form=el('form'),mode=p.type==='checkout-mpp-0.1.21'?'checkout.status':p.type==='intent-common-0.1.43'?'sdk.refresh':'payment.refresh';
  form.append(el('div',{class:'form-grid'},[field('Original payment ID','paymentId','',{required:true}),p.type==='checkout-mpp-0.1.21'?field('Original invoice link ID','linkId','',{required:true}):null,p.type==='checkout-mpp-0.1.21'?field('Native provider','provider','coinbase',{choices:['coinbase','bitrefill']}):null]),el('div',{class:'form-actions'},el('button',{type:'submit',text:'Read original payment'})));
  form.onsubmit=async e=>{e.preventDefault();e.submitter.disabled=true;try{await command(mode,{profileId:p.id,paymentId:input(form,'paymentId'),...(input(form,'linkId')?{linkId:input(form,'linkId'),provider:input(form,'provider')}:{})});}catch(error){notify(error.message,true);}finally{e.submitter.disabled=false;}};return form;
}
function paymentTable(rows){
  if(!rows.length)return empty('No original payment observations','Read an existing payment or capture the original merchant source.');
  return table(['Original order / payment','Provider status','Received / fee','Payout / merchant','Differences',''],rows.map(r=>[
    [el('strong',{text:r.orderId??'Unmatched original order'}),el('small',{class:'mono',text:r.paymentId}),el('small',{text:date(r.providerUpdatedAt)})],
    badge(r.status.replace('payment_',''),r.status==='payment_completed'?'good':['payment_refunded','payment_bounced'].includes(r.status)?'bad':''),
    [r.receivedSource?display(r.receivedSource.raw)+' '+(r.receivedSource.asset?.tokenSymbol??''):'—',el('small',{text:'Fee '+display(r.sourceFee?.raw)})],
    [badge(r.destinationPayout.state,r.destinationPayout.state==='provider_confirmed'?'good':''),el('small',{text:'Merchant '+r.merchantSettlement.state}),el('small',{text:'Fulfilment '+r.fulfilment.state})],
    badge(r.unresolved.length?String(r.unresolved.length)+' to review':'No current differences',r.unresolved.length?'warn':'good'),
    button('Inspect',()=>inspectPayment(r),'ghost')
  ]));
}
function paymentsPage(){
  if(!requireProfile())return profilePrompt();
  const query=el('input',{value:filter.query,placeholder:'Order ID, payment ID or status',class:'grow',ariaLabel:'Search payments'}),status=el('select',{ariaLabel:'Provider status'},[el('option',{value:'',text:'All statuses'}),...statuses.map(v=>el('option',{value:v,text:v.replace('payment_','')}))]);status.value=filter.status;
  const unresolved=check('Needs review','unresolved',filter.unresolved);
  const apply=async()=>{filter={query:query.value,status:status.value,unresolved:unresolved.querySelector('input').checked,offset:0};await refresh();};
  query.onkeydown=e=>{if(e.key==='Enter')apply();};
  return card('Full retained payment register',[el('div',{class:'toolbar'},[query,status,unresolved,button('Apply filter',apply)]),paymentTable(state.payments.items),el('div',{class:'pagination'},[fmt(state.payments.total)+' matching original payments',el('div',{class:'row'},[button('Previous',async()=>{filter.offset=Math.max(0,filter.offset-100);await refresh();},'secondary',{disabled:filter.offset===0}),button('Next',async()=>{filter.offset=state.payments.nextOffset;await refresh();},'secondary',{disabled:state.payments.nextOffset===null})])])]);
}
async function inspectPayment(row){
  const profileId=row.profileId,paymentId=row.paymentId,loading=el('p',{text:'Reading full original payment history…'}),generation=showDialog('Payment '+paymentId,loading);
  const value=await api('/api/payments/'+encodeURIComponent(profileId)+'/'+encodeURIComponent(paymentId));if(generation!==dialogGeneration||selected!==profileId)return;
  const r=value.row,p=selectedProfile(),refreshCommand=p.type==='checkout-mpp-0.1.21'?'checkout.status':p.type==='intent-common-0.1.43'?'sdk.refresh':'payment.refresh';
  const operations=el('div',{class:'toolbar'},[button('Review difference',()=>editDecision(value),''),button('Original refresh',async()=>{if(p.type==='checkout-mpp-0.1.21'){showDialog('Read native Checkout receipt',nativeSelectionForm(p));return;}closeDialog();await command(refreshCommand,{profileId,paymentId});}),button('Attach original order',()=>attachPayment(r)),['merchant-key-v2','intent-common-0.1.43'].includes(p.type)?button('Register existing pay-in',()=>registerPayin(r)):null]);
  const summary=table(['Source payment','Destination payout','Merchant settlement','Fulfilment'],[[json(r.sourcePayment),json(r.destinationPayout),json(r.merchantSettlement),json(r.fulfilment)]]);
  const history=el('div',{class:'timeline'},value.observations.map(o=>el('details',{},[el('summary',{text:o.kind+' · '+date(o.recordedAt)+' · '+short(o.id)}),el('p',{class:'mono',text:o.sha256}),json(o.value),o.captureId?button('Original response bytes',()=>inspectCapture(o.captureId),'ghost'):null])));
  $('dialog-body').replaceChildren(operations,summary,el('h3',{text:'Current original differences'}),r.unresolved.length?el('ul',{},r.unresolved.map(x=>el('li',{text:x}))):el('p',{class:'muted',text:'No unresolved differences in the selected source.'}),el('h3',{text:'Retained decisions'}),json(r.decisions),el('h3',{text:'Full original observations'}),history);
}
function editDecision(detail){
  const r=detail.row,revision=state.workspace.revision,form=el('form'),issues=el('div',{class:'stack'},r.issues.map(issue=>check(issue,'issue',false)));
  form.append(el('p',{class:'mono',text:r.paymentId+' · source '+r.sourceSha256}),el('div',{class:'form-grid'},[
    field('Decision kind','kind','provider_review',{choices:[['provider_review','Request provider review'],['accepted_variance','Accept selected differences'],['fulfilment','Record fulfilment observation'],['reopen','Reopen a prior decision']]}),
    field('Superseded original decision','supersedes','',{choices:[['','No predecessor'],...detail.decisions.filter(x=>!r.decisions.find(d=>d.id===x.value.id)?.superseded).map(x=>[x.value.id,x.value.kind+' · '+x.value.id])]}),
    field('Concrete reason','reason','',{type:'textarea',required:true,wide:true}),
    field('Fulfilment state','fulfilmentState','delivered',{choices:['pending','delivered','failed','cancelled']}),field('Fulfilment source reference','reference','')
  ]),el('p',{class:'section-label',text:'Differences explicitly accepted (accepted variance only)'}),issues,el('div',{class:'form-actions'},el('button',{type:'submit',text:'Retain this decision'})));
  form.onsubmit=async e=>{e.preventDefault();e.submitter.disabled=true;try{const kind=input(form,'kind'),value={id:uid('decision'),profileId:r.profileId,paymentId:r.paymentId,kind,basisSha256:r.sourceSha256,reason:input(form,'reason')};
    if(input(form,'supersedes'))value.supersedes=input(form,'supersedes');if(kind==='accepted_variance')value.issues=[...issues.querySelectorAll('input')].flatMap((x,i)=>x.checked?[r.issues[i]]:[]);if(kind==='fulfilment')value.value={state:input(form,'fulfilmentState'),reference:input(form,'reference')};
    const result=await command('decision.save',value,revision);if(result.state!=='pending')closeDialog();
  }catch(error){notify(error.message,true);}finally{e.submitter.disabled=false;}};
  showDialog('Review the exact original source',form);
}
function attachPayment(row){
  const form=el('form'),revision=state.workspace.revision;form.append(field('Original retained order','orderId','',{choices:[['','Select original order'],...state.orders.map(o=>[o.value.id,o.value.orderId+' · '+o.value.title])],required:true}),el('div',{class:'form-actions'},el('button',{type:'submit',text:'Attach original order'})));
  form.onsubmit=async e=>{e.preventDefault();try{await command('payment.attach',{profileId:row.profileId,paymentId:row.paymentId,orderId:input(form,'orderId')},revision);closeDialog();}catch(error){notify(error.message,true);}};showDialog('Match original order',form);
}
function registerPayin(row){
  const p=selectedProfile(),form=el('form'),revision=state.workspace.revision;
  form.append(el('p',{text:'Register an already existing source transaction. The operator does not construct, sign or send funds.'}),field('Original source transaction hash','txHash','',{required:true}),field('Original sender address','from','',{required:p.type==='merchant-key-v2'}),el('div',{class:'form-actions'},el('button',{type:'submit',text:'Register existing transaction'})));
  form.onsubmit=async e=>{e.preventDefault();e.submitter.disabled=true;try{const value={profileId:p.id,paymentId:row.paymentId,txHash:input(form,'txHash')};if(input(form,'from'))value[p.type==='merchant-key-v2'?'fromAddress':'senderAddress']=input(form,'from');closeDialog();await command(p.type==='merchant-key-v2'?'merchant.register':'sdk.register',value,revision);}catch(error){notify(error.message,true);}finally{e.submitter.disabled=false;}};showDialog('Original pay-in registration',form);
}

function sourceForm(){
  const p=selectedProfile(),form=el('form'),now=new Date(),before=new Date(now.getTime()-24*3600000),local=d=>d.toISOString().slice(0,16);
  form.append(el('div',{class:'form-grid'},[field('From (UTC, inclusive)','fromDate',local(before),{type:'datetime-local',required:true}),field('To (UTC, inclusive)','toDate',local(now),{type:'datetime-local',required:true}),field('Rows per native page','limit','100',{type:'number',min:1,max:100,required:true})]),el('p',{class:'muted',text:'Every original page is retained with its offset, reported total and raw response. The provider’s newest-first list can change during capture; a following capture records those changes.'}),el('div',{class:'form-actions'},el('button',{type:'submit',text:'Capture complete original period'})));
  form.onsubmit=async e=>{e.preventDefault();e.submitter.disabled=true;try{await command('capture.payments',{id:uid('capture'),profileId:p.id,fromDate:new Date(input(form,'fromDate')+'Z').toISOString(),toDate:new Date(input(form,'toDate')+'Z').toISOString(),limit:number(form,'limit')});}catch(error){notify(error.message,true);}finally{e.submitter.disabled=false;}};return form;
}
function scheduleForm(record){
  const p=selectedProfile(),s=record?.value??{id:uid('schedule'),intervalSeconds:300,lookbackHours:24,enabled:false},revision=state.workspace.revision,form=el('form');
  form.append(el('div',{class:'form-grid'},[field('Schedule ID','id',s.id,{required:true,readOnly:Boolean(record)}),field('Every (seconds)','intervalSeconds',s.intervalSeconds,{type:'number',min:15,max:86400,required:true}),field('Look back (hours)','lookbackHours',s.lookbackHours,{type:'number',min:1,max:8784,required:true}),check('Run while this original operator is open','enabled',s.enabled)]),el('div',{class:'form-actions'},el('button',{type:'submit',text:'Save catch-up schedule'})));
  form.onsubmit=async e=>{e.preventDefault();try{await command('schedule.save',{id:input(form,'id'),profileId:p.id,enabled:form.elements.enabled.checked,intervalSeconds:number(form,'intervalSeconds'),lookbackHours:number(form,'lookbackHours')},revision);closeDialog();}catch(error){notify(error.message,true);}};return form;
}
function stellarForm(){
  const p=selectedProfile(),form=el('form');
  form.append(el('p',{class:'mono',text:p.stellar.contractId}),el('p',{class:'muted',text:p.stellar.networkPassphrase}),el('div',{class:'form-grid'},[field('Start ledger (inclusive)','startLedger',p.stellar.startLedger,{type:'number',min:1,required:true}),field('End ledger (exclusive; blank fixes current observed end)','endLedger','',{type:'number',min:1}),field('Rows per RPC page','limit','100',{type:'number',min:1,max:10000,required:true}),check('Retain each original transaction envelope and result','transactions',true)]),el('div',{class:'form-actions'},el('button',{type:'submit',text:'Capture original contract events'})));
  form.onsubmit=async e=>{e.preventDefault();e.submitter.disabled=true;try{const value={id:uid('stellar'),profileId:p.id,startLedger:number(form,'startLedger'),limit:number(form,'limit'),transactions:form.elements.transactions.checked};if(input(form,'endLedger'))value.endLedger=number(form,'endLedger');await command('capture.stellar',value);}catch(error){notify(error.message,true);}finally{e.submitter.disabled=false;}};return form;
}
function sourcesPage(){
  const p=requireProfile();if(!p)return profilePrompt();
  return el('div',{},[
    p.type==='merchant-key-v2'?card('Original merchant period',sourceForm(),button('Refresh all retained payments',()=>command('capture.active',{id:uid('active'),profileId:p.id}))):card('Original native payment source',nativeSelectionForm(p)),
    card('Capture history',state.captures.length?table(['Capture','State','Coverage / cursor','Original request'],state.captures.map(r=>{const c=r.value;return [el('span',{class:'mono',text:c.id}),badge(c.state,c.state==='complete'?'good':'warn'),[fmt(c.paymentIds?.length??c.eventIds?.length??c.observations?.length??0)+' retained identities',el('small',{text:c.kind==='stellar'?'Original RPC cursor: '+short(c.cursor):'Original offset: '+(c.offset??c.index??0)})],el('div',{class:'row'},[button('Read source',()=>showDialog('Complete capture receipt',json(c)),'ghost'),c.state!=='complete'?button('Resume original',()=>adoptPending(c.requestId,true),'ghost'):null])];})):empty('No capture editions yet','Each complete native page and exact continuation cursor will appear here.'),button('Raw source register',()=>inspectSources(),'ghost')),
    p.type==='merchant-key-v2'?card('Recurring catch-up',state.schedules.length?table(['Schedule','Enabled','Interval','Original continuation',''],state.schedules.map(r=>[r.value.id,badge(r.value.enabled?'On':'Paused',r.value.enabled?'good':''),r.value.intervalSeconds+' s / '+r.value.lookbackHours+' h',r.value.lastRequestId??'Not started',button('Edit / pause',()=>showDialog('Original recurring schedule',scheduleForm(r)),'ghost')])):el('p',{class:'muted',text:'A schedule retains one original request per period. Closing the operator drains its current call; reopening resumes the same pending period.'}),button('Add schedule',()=>showDialog('Recurring source catch-up',scheduleForm()),'')):null,
    p.stellar?card('Native Stellar contract',stellarForm(),button('Read configuration / intent history',async()=>{const value=await api('/api/contracts/'+encodeURIComponent(p.id));showDialog('Original contract projection',json(value));},'ghost')):null
  ]);
}
async function inspectSources(offset=0){
  const profileId=selected,generation=showDialog('Original source register',el('p',{text:'Reading original source descriptors…'})),q=new URLSearchParams({profileId,offset:String(offset),limit:'100'}),result=await api('/api/captures?'+q);
  if(generation!==dialogGeneration||profileId!==selected)return;
  $('dialog-body').replaceChildren(table(['Kind / time','Original source','Response',''],result.items.map(c=>[[c.kind,el('small',{text:date(c.recordedAt)})],el('span',{class:'mono',text:c.request.url??c.request.path??c.id}),[c.status??c.error?.code??'Observed',el('small',{text:c.body?fmt(c.body.bytes)+' original bytes':'No complete response body'})],button('Inspect',()=>inspectCapture(c.id),'ghost')])),el('div',{class:'pagination'},[fmt(result.total)+' captures',result.nextOffset!==null?button('Next original page',()=>inspectSources(result.nextOffset)):null]));
}
async function inspectCapture(captureId){
  const generation=showDialog('Original source bytes',el('p',{text:'Reading capture…'})),c=await api('/api/captures/'+encodeURIComponent(captureId));if(generation!==dialogGeneration)return;
  $('dialog-body').replaceChildren(json(c),c.body?button('Download complete original body',()=>download('/api/objects/'+c.body.sha256+'?name='+encodeURIComponent('rozo-source-'+captureId+'.json'),c.body),''):null);
}
function reportsPage(){
  if(!requireProfile())return profilePrompt();
  const rows=state.reports;
  const compareForm=el('form',{class:'toolbar'},[field('Baseline report','before','',{choices:[['','Select baseline'],...rows.map(r=>[r.id,r.title+' · '+date(r.createdAt)])],required:true}),field('Following report','after','',{choices:[['','Select following'],...rows.map(r=>[r.id,r.title+' · '+date(r.createdAt)])],required:true}),el('button',{type:'submit',text:'Compare full reports',class:'secondary'})]);
  compareForm.onsubmit=async e=>{e.preventDefault();try{const result=await api('/api/compare?'+new URLSearchParams({before:input(compareForm,'before'),after:input(compareForm,'after')}));showDialog('Full original period comparison',[el('p',{text:fmt(result.changes.length)+' payment rows changed between the two retained reports.'}),...result.changes.map(c=>el('details',{},[el('summary',{text:c.paymentId}),json(c)]))]);}catch(error){notify(error.message,true);}};
  return el('div',{},[card('Saved period reports',rows.length?table(['Report','Selected period','Original counts','Full report files'],rows.map(r=>[[el('strong',{text:r.title}),el('small',{class:'mono',text:r.id}),el('small',{text:date(r.createdAt)})],[date(r.period.from),el('small',{text:'to '+date(r.period.to)+' · '+r.period.field})],json(r.counts),el('div',{class:'link-list'},r.files.map(f=>button(f.type.includes('csv')?'CSV':f.type.includes('html')?'HTML':'Complete JSON',()=>download('/api/objects/'+f.sha256+'?name='+encodeURIComponent(f.name),f),'ghost')))])):empty('No report edition yet','Select a source period after reviewing original payments and decisions.'),button('Save period report',()=>editReport(),'')),rows.length>1?card('Baseline and following period',compareForm):null]);
}
function editReport(){
  const p=selectedProfile();if(!p)throw Error('Select a merchant profile.');const revision=state.workspace.revision,form=el('form'),to=new Date(),from=new Date(Date.UTC(to.getUTCFullYear(),to.getUTCMonth(),1));
  form.append(el('div',{class:'form-grid'},[field('Report title','title',p.label+' · '+to.toISOString().slice(0,7),{required:true,wide:true}),field('Period starts (UTC, inclusive)','from',from.toISOString().slice(0,16),{type:'datetime-local',required:true}),field('Period ends (UTC, exclusive)','to',to.toISOString().slice(0,16),{type:'datetime-local',required:true}),field('Original provider date','field','createdAt',{choices:[['createdAt','Payment creation time'],['updatedAt','Latest provider update time']]}),field('Report note','notes','',{type:'textarea',wide:true})]),el('div',{class:'form-actions'},el('button',{type:'submit',text:'Freeze full report and files'})));
  form.onsubmit=async e=>{e.preventDefault();e.submitter.disabled=true;try{const value={id:uid('report'),profileId:p.id,title:input(form,'title'),period:{from:new Date(input(form,'from')+'Z').toISOString(),to:new Date(input(form,'to')+'Z').toISOString(),field:input(form,'field')},...(input(form,'notes')?{notes:input(form,'notes')}:{})};const result=await command('report.save',value,revision);if(result.state!=='pending')closeDialog();}catch(error){notify(error.message,true);}finally{e.submitter.disabled=false;}};showDialog('Save immutable period report',form);
}
function requestsPage(){
  return card('Original operation journal',[el('p',{class:'muted',text:'The native journal retains each full prepared request, its provider attempts and its accepted result. A later source revision does not replace an original request identity.'}),table(['Original request','Actor / command','State','Attempts',''],state.requests.map(r=>[el('span',{class:'mono',text:r.id}),[r.actor,el('small',{text:r.command})],badge(r.state,r.state==='accepted'?'good':'warn'),String(r.attempts.length),button('Inspect / continue',()=>inspectRequest(r.id),'ghost')])),state.requestPage.nextOffset?button('Read later journal page',()=>requestPage(state.requestPage.nextOffset),'secondary'):null]);
}
async function requestPage(offset){
  const generation=showDialog('Original operation journal',el('p',{text:'Reading original page…'})),r=await api('/api/requests?'+new URLSearchParams({offset:String(offset),limit:'100'}));if(generation!==dialogGeneration)return;
  $('dialog-body').replaceChildren(table(['Request','Command','State',''],r.items.map(v=>[el('span',{class:'mono',text:v.id}),v.envelope.command,badge(v.state),button('Inspect',()=>inspectRequest(v.id),'ghost')])),r.nextOffset!==null?button('Next original page',()=>requestPage(r.nextOffset)):null);
}
async function inspectRequest(requestId){
  const generation=showDialog('Original request',el('p',{text:'Reading retained request and attempts…'})),r=await api('/api/requests/'+encodeURIComponent(requestId));if(generation!==dialogGeneration)return;
  $('dialog-body').replaceChildren(r.state!=='accepted'?el('div',{class:'toolbar'},[button('Continue original prepared operation',async()=>{closeDialog();await adoptPending(requestId,true);},''),r.request?.envelope.command==='checkout.create'?button('Recover actual native payment',()=>nativeRecovery(r)):null]):null,json(r));
}
function nativeRecovery(original){
  const p=original.request.intent.profile,linkId=original.request.intent.originalLinkId,revision=state.workspace.revision,form=el('form');
  form.append(el('p',{text:'Use the actual payment ID returned by the original native create or retained Checkout state. The original router must bind it to the same invoice link.'}),field('Original pending request','originalRequestId',original.requestId,{readOnly:true}),field('Original invoice link ID','linkId',linkId,{readOnly:true}),field('Actually returned native payment ID','paymentId','',{required:true}),field('Original provider','provider','coinbase',{choices:['coinbase','bitrefill']}),el('div',{class:'form-actions'},el('button',{type:'submit',text:'Inspect and recover original native request'})));
  form.onsubmit=async e=>{e.preventDefault();try{await command('native.recover',{profileId:p.id,originalRequestId:original.requestId,paymentId:input(form,'paymentId'),linkId,provider:input(form,'provider')},revision);closeDialog();}catch(error){notify(error.message,true);}};showDialog('Recover the original Checkout create',form);
}
async function showHistory(kind,id){
  const generation=showDialog('Original record history',el('p',{text:'Reading full retained editions…'})),r=await api('/api/records/'+encodeURIComponent(kind)+'/'+encodeURIComponent(id)+'/history');if(generation!==dialogGeneration)return;
  if(r.workspaceId!==state.workspace.workspaceId||r.kind!==kind||r.id!==id)throw Error('History belongs to another original record.');
  $('dialog-body').replaceChildren(el('p',{class:'mono',text:kind+' / '+id}),el('div',{class:'timeline'},r.editions.map(v=>el('details',{},[el('summary',{text:'Edition '+v.version+' · workspace '+v.workspaceRevision+' · '+v.actor}),el('p',{class:'mono',text:v.requestId+' · '+v.sha256}),json(v.value)]))));
}
function workspaceSummary(){
  return card('Original workspace identity',el('div',{class:'grid'},[el('div',{},[el('h3',{text:'Workspace'}),el('p',{class:'mono',text:state.workspace.workspaceId}),el('p',{class:'muted',text:'Origin '+state.workspace.originId}),badge(state.control.mode,state.control.mode==='sealed'?'warn':'good')]),el('div',{},[el('h3',{text:'Verified application source'}),el('p',{class:'mono',text:state.sourceIdentity?.manifestSha256??'No installed source selected'}),el('p',{class:'muted',text:fmt(state.sourceIdentity?.fileCount??state.sourceIdentity?.files?.length??0)+' original members'})])]));
}
function workspacePage(){
  return el('div',{},[workspaceSummary(),card('Profiles and connection selection',state.profiles.length?table(['Profile','Provider','Host alias',''],state.profiles.map(p=>[p.value.label,p.value.type,p.value.connection,el('div',{class:'row'},[button('Edit',()=>editProfile(p),'ghost'),button('History',()=>showHistory('profile',p.value.id),'ghost')])])):empty('No merchant profiles','Configure original connection aliases on the host, then select their actual source identities.'),button('Add profile',()=>editProfile(),'')),
    card('Export or hand over the complete workspace',el('div',{class:'split'},[
      el('div',{},[el('h3',{text:'Working snapshot'}),el('p',{class:'muted',text:'Save the current complete source, original SQLite history, raw provider bytes and native Checkout state for review. The current owner remains active.'}),button('Export working snapshot',()=>exportWorkspace(false),'secondary',{disabled:state.control.mode==='sealed'})]),
      el('div',{},[el('h3',{text:'Permanent custody handover'}),el('p',{class:'muted',text:'Drain active work and recurring capture, seal this original sender, and save the complete receiving package. The receiving host can then activate the same original workspace.'}),button('Prepare custody handover',()=>exportWorkspace(true),'danger',{disabled:state.control.mode==='sealed'})])
    ])),
    card('Complete original deliveries',state.deliveries.length?table(['Delivery','Mode','Original request',''],state.deliveries.map(d=>[d.title,badge(d.mode),el('span',{class:'mono',text:d.requestId}),el('div',{class:'row'},[button('Read / download',()=>deliveryDetail(d),'ghost'),button('Finish original archive',()=>adoptPending(d.requestId,true),'ghost')])])):empty('No complete workspace export yet','Exports retain full sources and original records, not just a report manifest.')),
    card('Original native audit',el('p',{class:'muted',text:'Read every retained request preparation, provider capture, record edition and recovery action.'}),button('Open audit history',()=>auditPage(),'secondary'))
  ]);
}
function exportWorkspace(handover){
  const revision=state.workspace.revision,form=el('form'),approved=check(handover?'I am transferring custody and want this original sender sealed after its work drains.':'Save a complete working snapshot for private review.','approved');
  form.append(field('Delivery title','title',handover?'ROZO original workspace handover':'ROZO working source snapshot',{required:true}),el('p',{text:handover?'The operation retains one handover request and one archive identity. If archive creation or its response is interrupted, finish that same prepared delivery from the recovery panel.':'Working snapshots preserve all source and history for review. Activate only an archive created by the original sender’s explicit custody handover.'}),approved,el('div',{class:'form-actions'},el('button',{type:'submit',class:handover?'danger':'',text:handover?'Drain, seal and build complete handover':'Build complete working snapshot'})));
  form.onsubmit=async e=>{e.preventDefault();if(!approved.querySelector('input').checked){notify('Review and select the original delivery action.',true);return;}const title=input(form,'title');closeDialog();try{const result=await command(handover?'workspace.handover':'workspace.export',{id:uid('delivery'),title},revision);if(result.delivery)await deliveryDetail({id:result.delivery.deliveryId,title});}catch(error){notify(error.message,true);}};showDialog(handover?'Transfer original workspace custody':'Export working snapshot',form);
}
async function deliveryDetail(record){
  const d=await api('/api/deliveries/'+encodeURIComponent(record.id));
  showDialog('Complete original delivery',[el('p',{text:record.title??d.name}),table(['Mode','Workspace revision','Original archive bytes'],[[d.mode,String(d.revision),fmt(d.bytes)]]),el('p',{class:'mono',text:'SHA-256 '+d.sha256}),el('p',{class:'muted',text:'The receiver verifies every member, opens the same original database and source, and binds host environment aliases separately.'}),button('Download complete private archive',()=>download('/api/deliveries/'+encodeURIComponent(record.id)+'/file',d),''),json(d)]);
}
async function download(path,descriptor){
  const ticket=await api('/api/download-ticket',{method:'POST',value:{path}});
  if(ticket.sha256!==descriptor.sha256||ticket.bytes!==descriptor.bytes)throw Error('The download descriptor differs from the original retained file.');
  const link=el('a',{href:ticket.url,download:ticket.name});document.body.append(link);link.click();link.remove();
  notify('Downloading '+fmt(descriptor.bytes)+' original bytes · SHA-256 '+descriptor.sha256);
}
async function auditPage(offset=0){
  const generation=showDialog('Original native audit',el('p',{text:'Reading audit…'})),r=await api('/api/audit?'+new URLSearchParams({offset:String(offset),limit:'100'}));if(generation!==dialogGeneration)return;
  $('dialog-body').replaceChildren(el('div',{class:'timeline'},r.items.map(v=>el('details',{},[el('summary',{text:'Revision '+v.revision+' · '+v.kind+' · '+date(v.at)}),el('p',{class:'mono',text:v.requestId??'Original source observation'}),json(v.value)]))),r.nextOffset!==null?button('Next original audit page',()=>auditPage(r.nextOffset)):null);
}
$('profile').onchange=async e=>{selected=e.target.value;sessionStorage.setItem('rozo-profile',selected);filter.offset=0;closeDialog();await refresh();};
$('refresh').onclick=refresh;
$('actor').value=localStorage.getItem('rozo-actor')??'Operator';$('actor').onchange=()=>localStorage.setItem('rozo-actor',$('actor').value);
if(!token){const f=el('form',{},[field('Private session token from the original startup link','token','',{type:'password',required:true}),el('div',{class:'form-actions'},el('button',{type:'submit',text:'Open original session'}))]);f.onsubmit=e=>{e.preventDefault();token=input(f,'token');sessionStorage.setItem('rozo-session',token);closeDialog();refresh();};showDialog('Open the original workspace',f);}else refresh();
