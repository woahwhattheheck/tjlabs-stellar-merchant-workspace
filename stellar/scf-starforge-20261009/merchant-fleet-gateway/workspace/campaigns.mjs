// MIT. Saved release waves over the original authenticated fleet workspace.
const PREFIX = 'releases/campaigns';
const DRAFT = 'stellar-forge.fleet-campaign-proposal.v1';
const $ = id => document.getElementById(id);
const copy = value => structuredClone(value);
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key,canonical(value[key])])) : value;
const same = (a,b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const node = (tag,text,className) => { const result=document.createElement(tag); if(text!==undefined)result.textContent=String(text);if(className)result.className=className;return result; };
const button = (label,action) => { const result=node('button',label);result.type='button';result.addEventListener('click',action);return result; };
const option = (value,label) => { const result=node('option',label);result.value=value;return result; };
const uuid = () => crypto.randomUUID();
const sha256 = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(canonical(value)))))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
const short = value => value ? value.slice(0,12) : '—';
const failure = {
 FLEET_CAMPAIGN_FLEET_CHANGED:'The serving fleet changed. Inspect its original revision and use a revised proposal for the current releases.',
 FLEET_CAMPAIGN_REVISION_CHANGED:'This saved plan changed. Refresh its retained history before another operation.',
 FLEET_CAMPAIGN_REVIEW_CHANGED:'The review expired or the saved plan changed. Review the current wave again.',
 FLEET_CAMPAIGN_OTHER_CANDIDATE_PRESENT:'The original gateway has another prepared candidate. Resolve that preparation in the existing release controls.',
 FLEET_CAMPAIGN_DRAIN_REQUIRED:'This exact original release still serves traffic, belongs to a candidate, or has admitted requests. Refresh after those requests drain.',
 FLEET_RELEASE_SLOT_IN_USE:'The target slot still owns another release. Retire that drained child in the existing release controls before reviewing this wave.',
 FLEET_CAMPAIGN_PAUSED:'The rollout is paused. Continue its retained control before reviewing or applying a wave.',
 FLEET_CAMPAIGN_SOURCE_CHANGED:'The staged source differs from the saved proposal. Inspect the original release catalog and prepare a revised proposal.',
 FLEET_CAMPAIGN_APPROVED_SOURCE_CHANGED:'The approved release identities changed. Preserve this request and inspect the original source.',
 FLEET_CAMPAIGN_CLOSING:'The original manager is closing. Reopen its retained workspace to continue the saved request.',
 FLEET_CAMPAIGN_CONTROL_REVISION_CHANGED:'Another operator changed the pause control. Refresh its current reason and revision.',
};
function download(name,value) {
 const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'}));
 const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function proposal(value) {
 const source=value?.schema==='stellar-forge.fleet-campaign-export.v1'?value.plan:value?.draft??value;
 if(!source||typeof source!=='object'||!Array.isArray(source.waves)||source.waves.length>32)throw Error('Open a complete rollout proposal or saved plan export.');
 let total=0;
 const valueText=(value,maximum)=>{if(typeof value!=='string'||value.length>maximum||/[\u0000-\u001f]/.test(value))throw Error('The proposal has an invalid or oversized field.');return value;};
 return {id:valueText(source.id??'',64),title:valueText(source.title??'',160),
  waves:source.waves.map((wave,index)=>{
   if(!wave||typeof wave!=='object'||!Array.isArray(wave.targets)||wave.targets.length>32)throw Error('Each wave supports up to 32 merchants.');
   total+=wave.targets.length;if(total>256)throw Error('A rollout supports up to 256 merchant selections across its waves.');
   return {id:valueText(wave.id??'wave-'+(index+1),64),label:valueText(wave.label??'Wave '+(index+1),120),
    targets:wave.targets.map(row=>{if(!row||typeof row!=='object')throw Error('Choose complete merchant, slot and release fields.');
     return {tenant:valueText(row.tenant??'',40),slot:valueText(row.slot??'',40),releaseId:valueText(row.releaseId??'',64)};})};
  })};
}
function savedRequest(value,control=false) {
 if(value==null)return null;
 const actions=control?['pause']:['save','advance','rollback','retire'];
 if(!value||typeof value!=='object'||!actions.includes(value.action)||!value.input||typeof value.input!=='object'||
   !/^[a-z][a-z0-9-]{0,63}$/.test(value.input.id??'')||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/.test(value.input.requestId??''))
  throw Error('The downloaded request is incomplete. Preserve its original JSON for inspection.');
 if(JSON.stringify(value).length>262144)throw Error('The retained request exceeds the original workspace request limit.');
 return copy(value);
}
export function bindFleetCampaignControls({request,getReleases,isBusy,setBusy}={}) {
 let stopped=false,busy=false,pausing=false,reading=false,epoch=0,key=null,planDigest=null,draft={id:'',title:'',waves:[]},
  plans=[],selected='',detail=null,review=null,reviewPage=0,pending=null,pendingControl=null,restoreError=null,
  refusedRequests=[],readingPromise=null,refreshAgain=false,selectionReadSerial=0,unreadableSession=null,lastUpdateRead=0;
 const catalogs=new Map(),loads=new Map(),reads=new Set(),mutations=new Set();
 const notice=(text,error=false)=>{ $('campaign-message').hidden=!text;$('campaign-message').textContent=text??'';$('campaign-message').className=error?'error':''; };
 const storage=()=>{
  if(!key)return;
  try{sessionStorage.setItem(key,JSON.stringify({schema:DRAFT,planDigest,draft,selected,pending,pendingControl,refusedRequests}));}
  catch{throw Error('The browser could not retain this request. Download the proposal and free session storage before submitting.');}
 };
 const editable=()=>!stopped&&!busy&&!isBusy()&&!pending&&!pendingControl&&!restoreError;
 const query=(suffix,args={})=>PREFIX+suffix+(Object.keys(args).length?'?'+new URLSearchParams(args):'');
 async function read(path) {
  if(stopped)throw Error('The rollout view is closed.');
  const controller=new AbortController();reads.add(controller);
  try{return await request(path,undefined,{signal:controller.signal});}finally{reads.delete(controller);}
 }
 function guard(action) {return (...args)=>{
  const report=error=>{if(!stopped)notice(failure[error.message]??error.message,true);};
  try{Promise.resolve(action(...args)).catch(report);}catch(error){report(error);}
 };}
 function rememberRequest(action,input,control=false) {
  const value={action,input:copy(input),at:new Date().toISOString()};
  if(control)pendingControl=value;else pending=value;
  storage();return value;
 }
 async function callSaved(saved) {
  const work=request(PREFIX+'/'+saved.action,saved.input);mutations.add(work);
  try{const result=(await work)?.result;
   if(!result||result.id!==saved.input.id)throw Error('The original response could not be matched to this saved request. Inspect and continue the same request.');
   return result;}finally{mutations.delete(work);}
 }
 function retainRefusal(saved) {
  refusedRequests.push({...copy(saved),inspectedAt:new Date().toISOString()});
  if(refusedRequests.length>64)refusedRequests.shift();
 }
 async function syncPending(observed) {
  if(pending&&pending.input.id===observed.id){
   const saved=pending,retained=observed.plan.requests.find(row=>row.id===saved.input.requestId);
   if(retained){
    if(!same(retained.request,saved.input)){
     if(!saved.refused)throw Error('The retained native request has another body. Keep this browser request for inspection.');
     retainRefusal(saved);pending=null;storage();
    }else if(retained.phase==='COMPLETE'){pending=null;storage();}
   }else if(saved.refused){retainRefusal(saved);pending=null;storage();notice('The refused request is preserved in the proposal download. Review the current selection before creating its replacement.',true);}
  }
  if(pendingControl&&pendingControl.input.id===observed.id){
   const saved=pendingControl,retained=observed.control.requests.find(row=>row.id===saved.input.requestId);
   if(retained){
    const expected=await sha256(saved.input);
    if(pendingControl!==saved||stopped)return;
    if(retained.requestSha256!==expected&&!saved.refused)throw Error('The native pause request has another body. Preserve this browser request for inspection.');
    if(retained.requestSha256!==expected)retainRefusal(saved);
    pendingControl=null;storage();
   }else if(saved.refused){retainRefusal(saved);pendingControl=null;storage();}
  }
 }
 async function loadSelected(id=selected) {
  if(!id){detail=null;renderSaved();return;}
  const generation=epoch,serial=++selectionReadSerial;
  let observed;
  try{observed=await read(query('/inspect',{id}));}
  catch(error){
   if(!stopped&&generation===epoch&&serial===selectionReadSerial&&id===selected&&error.status===404&&pending?.action==='save'&&pending.input.id===id&&pending.refused){
    retainRefusal(pending);pending=null;detail=null;storage();renderSaved();controls();return;
   }throw error;
  }
  if(stopped||generation!==epoch||serial!==selectionReadSerial||id!==selected)return;
  detail=observed;await syncPending(observed);
  if(stopped||generation!==epoch||serial!==selectionReadSerial||id!==selected)return;
  if(!pending&&observed.pendingRequest){
   const native=observed.plan.pending;
   pending={action:native.kind==='rollback'?'rollback':'advance',input:copy(observed.pendingRequest),at:new Date().toISOString()};
   storage();
  }
  if(review&&(review.revision!==observed.revision||review.before.revision!==observed.observed.revision||review.before.digest!==observed.observed.digest))review=null;
  renderSaved();renderReview();controls();
 }
 async function refresh({afterWrite=false}={}) {
  if(stopped||!getReleases())return;
  if(readingPromise){if(afterWrite)refreshAgain=true;return readingPromise;}
  reading=true;
  const run=(async()=>{
   try{
    do{
     refreshAgain=false;const generation=epoch;
     const result=await read(query(''));
     if(stopped)return;
     if(generation!==epoch){refreshAgain=true;continue;}
     plans=result.campaigns;
     if(pending?.input.id)selected=pending.input.id;
     else if(pendingControl?.input.id)selected=pendingControl.input.id;
     renderList();await loadSelected();lastUpdateRead=Date.now();
    }while(refreshAgain&&!stopped);
   }catch(error){if(!stopped)notice(failure[error.message]??error.message,true);}
   finally{reading=false;readingPromise=null;if(!stopped)controls();}
  })();
  readingPromise=run;return run;
 }
 async function mutate(action,input,{control=false,reuse=false}={}) {
  if(stopped||(!control&&(busy||isBusy()))||(control&&pausing))return;
  if(!reuse&&(control?pendingControl:pending))throw Error('Continue or inspect the exact retained request before creating another.');
  const saved=reuse?(control?pendingControl:pending):rememberRequest(action,input,control);
  if(!saved)throw Error('Select the exact saved request.');
  if(control)pausing=true;else{busy=true;setBusy(true);}
  controls();
  try{
   const result=await callSaved(saved);
   if(stopped)return result;
   selected=saved.input.id;
   if(control){pendingControl=null;storage();}
   else if(!result.awaiting&&result.requestId===saved.input.requestId){pending=null;storage();}
   notice(result?.awaiting?'The approved request is retained. Continue the rollout when ready.':'Original rollout state saved.');
   review=null;await refresh({afterWrite:true});return result;
  }catch(error){
   if(error.status>=400&&error.status<500){saved.refused={code:error.message,status:error.status};storage();}
   if(!stopped){notice(failure[error.message]??('Request retained: '+error.message),true);await refresh({afterWrite:true});}
   throw error;
  }finally{
   if(control)pausing=false;else{busy=false;if(!stopped)setBusy(false);}
   if(!stopped)controls();
  }
 }
 async function reviewAction(kind) {
  if(!editable()||!detail)return;
  busy=true;setBusy(true);controls();const chosen=selected,generation=epoch;
  try{
   const input={id:chosen,expectedRevision:detail.revision};
   if(kind==='rollback')input.targetRevision=Number($('campaign-rollback-revision').value);
   const response=await request(PREFIX+'/'+(kind==='rollback'?'rollback-review':'review'),input);
   if(stopped||epoch!==generation||selected!==chosen)return;
   review=response.result;reviewPage=0;renderReview();notice('Compare the exact release and payment changes, then apply this reviewed '+(kind==='rollback'?'rollback.':'wave.'));
  }finally{busy=false;if(!stopped){setBusy(false);controls();}}
 }
 function selectValues(select,rows,current,placeholder){
  select.replaceChildren(option('',placeholder),...rows.map(row=>option(row.value,row.label)));
  if(current&&!rows.some(row=>row.value===current))select.append(option(current,current+' (saved selection)'));
  select.value=current;
 }
 function beforeSlot(tenant,waveIndex){
  let value=getReleases()?.tenants.find(row=>row.id===tenant)?.slots.find(row=>row.serving)?.name;
  for(const wave of draft.waves.slice(0,waveIndex)){const target=wave.targets.find(row=>row.tenant===tenant);if(target)value=target.slot;}
  return value;
 }
 async function loadCatalog(tenant,slot) {
  if(!tenant||!slot)return;const name=tenant+'/'+slot;if(loads.has(name))return loads.get(name);
  const generation=epoch;
  const work=read('releases/catalog?'+new URLSearchParams({tenant,slot})).then(value=>{
   if(!stopped&&generation===epoch){catalogs.set(name,value);refreshCatalogChoices();controls();}
  }).finally(()=>loads.delete(name));
  loads.set(name,work);return work;
 }
 function refreshCatalogChoices(){
  for(const element of $('campaign-waves').querySelectorAll('[data-campaign-release]')){
   const [waveIndex,targetIndex]=element.dataset.campaignRelease.split('/').map(Number),target=draft.waves[waveIndex]?.targets[targetIndex];
   if(!target)continue;
   const catalog=catalogs.get(target.tenant+'/'+target.slot);
   selectValues(element,(catalog?.releases??[]).filter(item=>!item.error).map(item=>({value:item.id,label:item.id+' · '+(item.sourceKind??'release')+' · '+short(item.digest)})),target.releaseId,'Load and choose staged release');
  }
 }
 function defaultTarget(waveIndex) {
  const tenants=getReleases()?.tenants??[],chosen=tenants.find(row=>!draft.waves[waveIndex].targets.some(target=>target.tenant===row.id));
  return {tenant:chosen?.id??'',slot:chosen?.slots.find(row=>row.name!==beforeSlot(chosen.id,waveIndex))?.name??'',releaseId:''};
 }
 function renderDraft(){
  if(stopped)return;
  $('campaign-id').value=draft.id;$('campaign-title').value=draft.title;
  const content=document.createDocumentFragment();
  draft.waves.forEach((wave,waveIndex)=>{
   const card=node('section',undefined,'campaign-wave'),head=node('div',undefined,'section-head'),label=node('label','Wave '+(waveIndex+1)+' label');
   const input=node('input');input.value=wave.label;input.maxLength=120;input.required=true;
   input.addEventListener('input',guard(()=>{wave.label=input.value;storage();}));
   label.append(input);head.append(label);
   for(const [title,delta]of[['Move up',-1],['Move down',1]]){
    const move=button(title,guard(()=>{if(!editable())return;const to=waveIndex+delta;if(to<0||to>=draft.waves.length)return;
     [draft.waves[to],draft.waves[waveIndex]]=[draft.waves[waveIndex],draft.waves[to]];storage();renderDraft();controls();}));
    move.dataset.campaignFixedDisabled=String(waveIndex+delta<0||waveIndex+delta>=draft.waves.length);
    move.disabled=!editable()||move.dataset.campaignFixedDisabled==='true';head.append(move);
   }
   head.append(button('Remove wave',guard(()=>{if(!editable())return;draft.waves.splice(waveIndex,1);storage();renderDraft();controls();})));card.append(head);
   wave.targets.forEach((target,targetIndex)=>{
    const row=node('div',undefined,'campaign-target'),tenantSelect=node('select'),slotSelect=node('select'),releaseSelect=node('select');
    const merchants=getReleases()?.tenants??[],merchant=merchants.find(item=>item.id===target.tenant);
    selectValues(tenantSelect,merchants.map(item=>({value:item.id,label:item.id+' · '+item.host})),target.tenant,'Choose merchant');
    selectValues(slotSelect,(merchant?.slots??[]).map(item=>({value:item.name,label:item.name+(item.name===beforeSlot(target.tenant,waveIndex)?' · preceding wave slot':'')})),target.slot,'Choose target slot');
    releaseSelect.dataset.campaignRelease=waveIndex+'/'+targetIndex;
    const catalog=catalogs.get(target.tenant+'/'+target.slot);
    selectValues(releaseSelect,(catalog?.releases??[]).filter(item=>!item.error).map(item=>({value:item.id,label:item.id+' · '+(item.sourceKind??'release')+' · '+short(item.digest)})),target.releaseId,'Load and choose staged release');
    for(const [name,select]of[['Merchant',tenantSelect],['Target slot',slotSelect],['Staged release',releaseSelect]]){
     const holder=node('label',name);select.required=true;holder.append(select);row.append(holder);
    }
    tenantSelect.addEventListener('change',guard(async()=>{if(!editable())return;target.tenant=tenantSelect.value;
     target.slot=merchants.find(item=>item.id===target.tenant)?.slots.find(item=>item.name!==beforeSlot(target.tenant,waveIndex))?.name??'';
     target.releaseId='';storage();renderDraft();controls();await loadCatalog(target.tenant,target.slot);}));
    slotSelect.addEventListener('change',guard(async()=>{if(!editable())return;target.slot=slotSelect.value;target.releaseId='';storage();renderDraft();controls();await loadCatalog(target.tenant,target.slot);}));
    releaseSelect.addEventListener('change',guard(()=>{if(!editable())return;target.releaseId=releaseSelect.value;storage();}));
    const buttons=node('div',undefined,'button-row');
    buttons.append(button('Load staged releases',guard(()=>loadCatalog(target.tenant,target.slot))),
     button('Remove merchant',guard(()=>{if(!editable())return;wave.targets.splice(targetIndex,1);storage();renderDraft();controls();})));
    row.append(buttons);card.append(row);
   });
   const add=button('Add merchant',guard(()=>{if(!editable())return;
    if(wave.targets.length>=(getReleases()?.tenants.length??32)||draft.waves.reduce((n,row)=>n+row.targets.length,0)>=256)throw Error('Choose at most one of each merchant per wave and up to 256 selections in this rollout.');
    wave.targets.push(defaultTarget(waveIndex));storage();renderDraft();controls();}));
   add.dataset.campaignFixedDisabled=String(wave.targets.length>=(getReleases()?.tenants.length??32)||draft.waves.reduce((n,row)=>n+row.targets.length,0)>=256);card.append(add);
   content.append(card);
  });
  $('campaign-waves').replaceChildren(content);
 }
 function renderList(){
  selectValues($('campaign-select'),plans.map(row=>({value:row.id,label:row.title+' · '+row.state+' · '+row.nextWave+'/'+row.totalWaves})),selected,'Choose saved rollout');
 }
 function renderSaved(){
  const summary=$('campaign-summary'),order=$('campaign-order'),history=$('campaign-history');summary.replaceChildren();order.replaceChildren();history.replaceChildren();
  $('campaign-rollback-area').hidden=!detail||detail.plan.nextWave===0||detail.plan.state==='ROLLED_BACK';
  $('campaign-retire-area').hidden=!detail||detail.retirements.length===0;
  if(!detail)return;
  summary.append(node('h4',detail.title),node('p',detail.state+' · '+detail.nextWave+' of '+detail.totalWaves+' waves applied'+(detail.paused?' · Paused':'')),
   node('p','Saved plan revision '+detail.revision+' · Original fleet revision '+detail.observed.revision,'small'));
  if(detail.relationship==='FLEET_CHANGED')summary.append(node('p',failure.FLEET_CAMPAIGN_FLEET_CHANGED,'error'));
  if(detail.paused&&detail.pauseReason)summary.append(node('p',detail.pauseReason));
  if(detail.plan.pending)summary.append(node('p','Retained '+detail.plan.pending.phase.toLowerCase().replaceAll('_',' ')+' request '+detail.plan.pending.requestId,'small'));
  const list=node('ol',undefined,'campaign-order');
  detail.plan.waves.forEach((wave,index)=>{const item=node('li',wave.label+' — '+wave.targets.map(target=>target.tenant+' → '+target.slot+'/'+target.releaseId).join(', '));
   if(index===detail.nextWave)item.className='campaign-current';list.append(item);});order.append(list);
  const earlier=detail.rollbackTargets??[],prior=$('campaign-rollback-revision').value;
  selectValues($('campaign-rollback-revision'),earlier.map(row=>({value:String(row.revision),
   label:'Revision '+row.revision+' · '+(row.availability==='SLOT_IN_USE'?'occupied slot':row.mode==='NATIVE_HISTORY'?'retained native snapshot':'review saved releases')})),
   earlier.some(row=>String(row.revision)===prior)?prior:String(earlier.find(row=>row.availability==='REVIEW_REQUIRED')?.revision??earlier[0]?.revision??''),'Choose original revision');
  renderRollbackAvailability();
  const table=node('table'),thead=node('thead'),head=node('tr');for(const title of ['Merchant / release','State','Admitted requests','Action'])head.append(node('th',title));thead.append(head);table.append(thead);
  const tbody=node('tbody');
  for(const row of detail.retirements){
   const tr=node('tr');tr.append(node('td',row.tenant+' · '+row.slot+'/'+row.releaseId),node('td',row.serving?'Serving':row.candidate?'Prepared':row.owned?'Draining / retained':'Closed'),
    node('td',row.drainingRequests));
   const cell=node('td'),retire=button('Retire drained release',guard(()=>mutate('retire',{id:detail.id,expectedRevision:detail.revision,requestId:uuid(),
    tenant:row.tenant,slot:row.slot,instanceId:row.instanceId,expectedNativeRevision:detail.observed.revision})));
   retire.disabled=!editable()||!row.canRetire;cell.append(retire);tr.append(cell);tbody.append(tr);
  }table.append(tbody);$('campaign-retirements').replaceChildren(table);
  const historyList=node('ol',undefined,'campaign-history');
  for(const row of detail.plan.history.slice(-40))historyList.append(node('li',row.at+' · '+row.kind.replaceAll('_',' ').toLowerCase()+
   (row.native?' · fleet revision '+row.native.revision:'')+(row.code?' · '+row.code:'')));
  history.append(historyList);
  if(detail.plan.history.length>40)history.append(node('p','Showing the latest 40 entries. Download includes the complete retained history.','small'));
 }
 function renderRollbackAvailability(){
  const area=$('campaign-rollback-availability');area.replaceChildren();
  const target=detail?.rollbackTargets?.find(row=>String(row.revision)===$('campaign-rollback-revision').value);
  if(!target)return;
  area.append(node('p',target.mode==='NATIVE_HISTORY'?'The original gateway retains this snapshot. Fresh review verifies its releases and owned slots.':
   'The saved rollout retains this exact release mapping. Fresh review verifies its original releases before the gateway prepares a new snapshot.','small'));
  for(const blocker of target.blockers){
   const why=blocker.serving?'currently serves another release; first use a reviewed release move to free this slot':
    blocker.candidate?'belongs to a prepared candidate; resolve that original preparation':
    blocker.drainingRequests?'still has '+blocker.drainingRequests+' admitted requests; wait for them to drain':
    blocker.canRetire?'owns an inactive release; retire that exact drained child in the original release controls':
    'is unavailable in the current managed fleet';
   area.append(node('p',blocker.tenant+' / '+blocker.slot+' '+why+'.','error'));
  }
  area.append(node('p',target.mapping.map(row=>row.tenant+' → '+row.slot+'/'+row.releaseId+' · port '+row.port).join('; '),'small'));
 }
 function routeText(route){return [route.method,route.path??route.url??route.id??route.name??'Route'].filter(Boolean).join(' ');}
 function terms(route){
  const value=route.offer?.accepts??route.accepts??route.paymentChoices??route.payment??route.price??route;
  return typeof value==='string'?value:JSON.stringify(value,null,2);
 }
 function renderReview(){
  $('campaign-review').hidden=!review;if(!review)return;
  const rollback=review.kind==='rollback';
  $('campaign-review-heading').textContent=rollback?'Review original rollback':review.label;
  $('campaign-review-description').textContent=rollback?
   (review.restoreMode==='RETAINED_RELEASES'?'Restore the saved release mapping for revision ':'Restore the retained native snapshot for revision ')+review.targetRevision+' from current revision '+review.before.revision+'.':
   'This wave changes '+review.atomicMerchants+' merchants together at original fleet revision '+review.before.revision+'.';
  $('campaign-apply').textContent=rollback?'Apply reviewed rollback':'Apply reviewed wave';
  const rows=review.comparisons??[],size=4,pages=Math.max(1,Math.ceil(rows.length/size));reviewPage=Math.min(reviewPage,pages-1);
  const content=document.createDocumentFragment();
  content.append(node('p','Reviewed whole mapping: '+review.after.map(row=>row.tenant+' → '+row.slot+'/'+row.releaseId+' · port '+row.port).join('; '),'small'));
  for(const item of rows.slice(reviewPage*size,(reviewPage+1)*size)){
   const article=node('article'),comparison=item.comparison??item;
   article.append(node('h4',item.tenant+' · '+(item.slot??'retained original mapping')));
   const info=node('dl',undefined,'delivery-identity');
   for(const [label,value]of[['Before',comparison.before?.id+' · '+short(comparison.before?.digest)],
    ['After',comparison.after?.id+' · '+short(comparison.after?.digest)],
    ['Source',comparison.after?.source?.kind??comparison.after?.sourceKind??'Original merchant']])info.append(node('dt',label),node('dd',value));
   article.append(info);
   for(const side of ['before','after']){
    const release=comparison[side],routes=release?.routes??[],wrap=node('div',undefined,'table-wrap'),table=node('table'),head=node('tr');
    head.append(node('th',side==='before'?'Current route':'Selected route'),node('th','Exact payment terms'));const thead=node('thead');thead.append(head);table.append(thead);
    const body=node('tbody');
    for(const route of routes.slice(0,64)){const tr=node('tr'),value=node('td');value.append(node('pre',terms(route),'campaign-price'));tr.append(node('td',routeText(route)),value);body.append(tr);}
    table.append(body);wrap.append(table);article.append(wrap);
    if(routes.length>64)article.append(node('p','Showing 64 of '+routes.length+' routes; the complete review download retains every route and term.','small'));
   }content.append(article);
  }
  $('campaign-review-content').replaceChildren(content);
  $('campaign-review-page').textContent='Merchants '+(reviewPage*size+1)+'–'+Math.min(rows.length,(reviewPage+1)*size)+' of '+rows.length;
  $('campaign-review-prev').disabled=reviewPage===0;$('campaign-review-next').disabled=reviewPage+1>=pages;
 }
 function controls(){
  const edit=editable();
  $('campaign-form').querySelectorAll('input,select,button').forEach(element=>{element.disabled=!edit||element.dataset.campaignFixedDisabled==='true';});
  $('campaign-new').disabled=stopped||busy||isBusy()||Boolean(pending)||Boolean(pendingControl);$('campaign-import').disabled=!edit;$('campaign-select').disabled=busy||pausing||Boolean(pending)||Boolean(pendingControl);
  $('campaign-refresh').disabled=stopped||reading;
  $('campaign-review-wave').disabled=!edit||!detail||detail.paused||detail.plan.state!=='READY'||detail.relationship!=='CURRENT';
  $('campaign-review-rollback').disabled=!edit||!detail||Boolean(detail.plan.pending)||detail.plan.state==='ROLLED_BACK'||
   detail.rollbackTargets?.find(row=>String(row.revision)===$('campaign-rollback-revision').value)?.availability!=='REVIEW_REQUIRED';
  $('campaign-copy').disabled=!edit||!detail;$('campaign-export').disabled=!detail||busy;
  $('campaign-pause').disabled=stopped||pausing||Boolean(pendingControl)||!detail||Boolean(getReleases()?.closing);
  $('campaign-pause').textContent=detail?.paused?'Continue rollout':'Pause rollout';
  $('campaign-retry').hidden=!pending&&!pendingControl;
  $('campaign-retry').disabled=stopped||busy||pausing||isBusy();
  $('campaign-apply').disabled=!edit||!review||Date.parse(review.expiresAt)<=Date.now();
  $('campaign-retirements').querySelectorAll('button').forEach((element,index)=>{element.disabled=!edit||!detail?.retirements[index]?.canRetire;});
  if(restoreError)notice(restoreError,true);
 }
 function update(){
  const current=getReleases();$('fleet-campaigns').hidden=!current;if(!current||stopped)return;
  if(current.planDigest!==planDigest){
   epoch++;planDigest=current.planDigest;key='starforge-fleet-campaigns-'+planDigest;catalogs.clear();review=null;detail=null;selected='';pending=null;pendingControl=null;
   draft={id:'',title:'',waves:[]};refusedRequests=[];restoreError=null;unreadableSession=null;
   try{const raw=sessionStorage.getItem(key)??'null';unreadableSession=raw;const saved=JSON.parse(raw);
    if(saved?.schema===DRAFT&&saved.planDigest===planDigest){draft=proposal(saved.draft);selected=saved.selected??'';
     pending=savedRequest(saved.pending);pendingControl=savedRequest(saved.pendingControl,true);
     refusedRequests=Array.isArray(saved.refusedRequests)?saved.refusedRequests.slice(-64):[];}
    unreadableSession=null;
   }catch{restoreError='The retained browser proposal could not be opened. Download it for inspection, then choose New proposal to reset this local draft.';}
   renderDraft();void refresh();
  }
  if(review&&current.native&&(review.before.revision!==current.native.revision||review.before.digest!==current.native.digest)){review=null;renderReview();}
  if(selected&&!readingPromise&&Date.now()-lastUpdateRead>=4000){lastUpdateRead=Date.now();void refresh();}
  controls();
 }
 $('campaign-refresh').addEventListener('click',guard(refresh));
 $('campaign-id').addEventListener('input',guard(()=>{draft.id=$('campaign-id').value;storage();}));
 $('campaign-title').addEventListener('input',guard(()=>{draft.title=$('campaign-title').value;storage();}));
 $('campaign-new').addEventListener('click',guard(()=>{if(stopped||busy||isBusy()||pending||pendingControl)return;
  if((draft.waves.length||restoreError)&&!window.confirm('Start a new proposal? Download the current proposal first if you need to keep it.'))return;
  restoreError=null;unreadableSession=null;draft={id:'rollout-'+uuid().slice(0,8),title:'',waves:[]};storage();renderDraft();controls();}));
 $('campaign-add-wave').addEventListener('click',guard(()=>{if(!editable())return;if(draft.waves.length>=32)throw Error('A rollout supports up to 32 ordered waves.');
  draft.waves.push({id:'wave-'+uuid().slice(0,8),label:'Wave '+(draft.waves.length+1),targets:[]});storage();renderDraft();controls();}));
 $('campaign-form').addEventListener('submit',guard(async event=>{event.preventDefault();if(!editable())return;
  if(!draft.waves.length||draft.waves.some(row=>!row.targets.length))throw Error('Add at least one merchant to every wave.');
  const editableSaved=detail?.id===draft.id&&detail.plan.nextWave===0&&detail.plan.state==='READY'&&detail.plan.history.every(row=>row.kind==='SAVED');
  await mutate('save',{...copy(draft),requestId:uuid(),...(editableSaved?{expectedRevision:detail.revision}:{})});}));
 $('campaign-select').addEventListener('change',guard(async()=>{if(busy||pausing||pending||pendingControl)return;epoch++;selected=$('campaign-select').value;detail=null;review=null;storage();renderReview();await loadSelected();}));
 $('campaign-review-wave').addEventListener('click',guard(()=>reviewAction('wave')));
 $('campaign-review-rollback').addEventListener('click',guard(()=>reviewAction('rollback')));
 $('campaign-apply').addEventListener('click',guard(()=>{if(!review||!editable())return;return mutate(review.kind==='rollback'?'rollback':'advance',
  {id:review.id,expectedRevision:review.revision,requestId:uuid(),reviewId:review.reviewId});}));
 $('campaign-pause').addEventListener('click',guard(async()=>{if(!detail||pausing||pendingControl)return;
  const reason=$('campaign-pause-reason').value.trim();return mutate('pause',{id:detail.id,requestId:uuid(),expectedControlRevision:detail.controlRevision,
   paused:!detail.paused,...(reason?{reason}:{})},{control:true});}));
 $('campaign-retry').addEventListener('click',guard(()=>pendingControl?mutate(pendingControl.action,pendingControl.input,{control:true,reuse:true}):
  pending?mutate(pending.action,pending.input,{reuse:true}):undefined));
 $('campaign-copy').addEventListener('click',guard(()=>{if(!editable()||!detail)return;draft=proposal(detail.plan);draft.id=detail.id.slice(0,45)+'-rev-'+uuid().slice(0,8);storage();renderDraft();controls();}));
 $('campaign-export').addEventListener('click',guard(async()=>{if(!detail)return;const result=await read(query('/export',{id:detail.id}));if(!stopped)download(detail.id+'-rollout.json',result);}));
 $('campaign-download-draft').addEventListener('click',()=>download((draft.id||'fleet')+'-proposal.json',{schema:DRAFT,planDigest,draft,selected,pending,pendingControl,refusedRequests,...(unreadableSession?{unreadableSession}:{})}));
 $('campaign-import').addEventListener('click',()=>{if(editable())$('campaign-file').click();});
 $('campaign-file').addEventListener('change',guard(async()=>{
  const file=$('campaign-file').files[0];if(!file)return;
  if(file.size>8*1024*1024)throw Error('Choose a rollout proposal under 8 MiB.');
  const generation=epoch,scope=planDigest,raw=await file.text();
  if(stopped||generation!==epoch||scope!==planDigest||!editable())return;
  const parsed=JSON.parse(raw),next=proposal(parsed),saved=parsed.schema===DRAFT?savedRequest(parsed.pending):null,
   savedControl=parsed.schema===DRAFT?savedRequest(parsed.pendingControl,true):null;
  if((saved||savedControl)&&parsed.planDigest!==planDigest)throw Error('This exact pending request belongs to another fleet. Open its original managed workspace to continue it.');
  if(saved&&savedControl&&saved.input.id!==savedControl.input.id)throw Error('The pending rollout and pause requests select different saved plans.');
  draft=next;pending=saved;pendingControl=savedControl;
  if(saved||savedControl)selected=(saved??savedControl).input.id;
  refusedRequests=Array.isArray(parsed.refusedRequests)?parsed.refusedRequests.slice(-64):[];
  storage();renderDraft();controls();$('campaign-file').value='';if(saved||savedControl)await refresh({afterWrite:true});
 }));
 $('campaign-rollback-revision').addEventListener('change',()=>{renderRollbackAvailability();controls();});
 $('campaign-clear-review').addEventListener('click',()=>{review=null;renderReview();controls();});
 $('campaign-review-prev').addEventListener('click',()=>{reviewPage=Math.max(0,reviewPage-1);renderReview();});
 $('campaign-review-next').addEventListener('click',()=>{reviewPage++;renderReview();});
 $('campaign-download-review').addEventListener('click',()=>{if(review)download(review.id+'-review.json',review);});
 return {update,refresh,async close(){stopped=true;epoch++;for(const controller of reads)controller.abort();await Promise.allSettled([...mutations]);}};
}
