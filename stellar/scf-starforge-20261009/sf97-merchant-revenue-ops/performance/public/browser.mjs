// MIT. Original-source performance operator journey.
const $=id=>document.getElementById(id);
const integrated=location.pathname==='/performance'||location.pathname.startsWith('/performance/');
const prefix=integrated?'/api/performance':'/api';
const TOKEN_KEY='merchant-performance-session:'+location.pathname;
let token='',workspace=null,sourceValue=null,prepared=null,current=null,proposed=null,savedProposal=null,received=null;
let reviewAfter=null,sourceAfter=null;
const e=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const display=value=>value===null||value===undefined?'Unknown':typeof value==='object'?JSON.stringify(value):String(value);
const table=(heads,rows)=>'<div class="table-wrap"><table><thead><tr>'+heads.map(x=>'<th>'+e(x)+'</th>').join('')+'</tr></thead><tbody>'+
  (rows.length?rows.map(row=>'<tr>'+row.map(cell=>'<td>'+e(display(cell))+'</td>').join('')+'</tr>').join(''):
  '<tr><td colspan="'+heads.length+'" class="muted">No rows in this selected source.</td></tr>')+'</tbody></table></div>';
const full=(label,value)=>'<details class="source"><summary>'+e(label)+'</summary><pre>'+e(JSON.stringify(value,null,2))+'</pre></details>';
function status(message){$('status').textContent=message;}
function failed(error){status((error.code?error.code+': ':'')+error.message);}
function header(){return integrated?{'x-sf97-workspace':token}:{authorization:'Bearer '+token};}
async function api(path,input){
  const response=await fetch(prefix+path,{method:input===undefined?'GET':'POST',headers:{...header(),...(input===undefined?{}:{'content-type':'application/json'})},
    ...(input===undefined?{}:{body:JSON.stringify(input)})});
  const text=await response.text();let value;
  try{value=JSON.parse(text);}catch{throw new Error('The original workspace returned an incomplete JSON response ('+response.status+').');}
  if(!response.ok){const detail=value.error??value;throw Object.assign(new Error(detail.message??text),{code:detail.code,status:response.status});}
  return value;
}
async function download(performanceId,name){
  const response=await fetch(prefix+'/files/'+encodeURIComponent(performanceId)+'/'+encodeURIComponent(name),{headers:header()});
  if(!response.ok){
    const text=await response.text();let detail;try{const value=JSON.parse(text);detail=value.error??value;}catch{detail={message:text};}
    throw Object.assign(new Error(detail.message??'Export failed.'),{code:detail.code,status:response.status});
  }
  const object=URL.createObjectURL(await response.blob()),a=document.createElement('a');
  a.href=object;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(object),30000);
}
async function action(button,run){
  if(button.disabled)return;
  button.disabled=true;
  try{await run();}catch(error){failed(error);}finally{button.disabled=false;}
}
async function stableId(kind,body){
  const encoded=new TextEncoder().encode(JSON.stringify(body)),digest=await crypto.subtle.digest('SHA-256',encoded);
  const identity=[...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
  const key='merchant-performance-request:'+location.pathname+':'+kind;
  let old;try{old=JSON.parse(sessionStorage.getItem(key));}catch{}
  if(old?.identity===identity)return old.id;
  const value={identity,id:crypto.randomUUID()};
  sessionStorage.setItem(key,JSON.stringify(value));return value.id;
}
function resetProposal(){
  proposed=null;savedProposal=null;$('proposal-result').replaceChildren();$('native-selection').replaceChildren();
  $('proposal-save-controls').hidden=true;$('commit-proposal').hidden=true;
}
function resetPreview(){
  prepared=null;$('preview-result').replaceChildren();$('save-controls').hidden=true;
}
function options(id,rows,label,value){
  $(id).innerHTML=rows.map(row=>'<option value="'+e(value(row))+'">'+e(label(row))+'</option>').join('');
}
function addSourceOptions(rows){
  for(const row of rows){
    if([...$('usage-options').options].some(option=>option.value===row.version))continue;
    const option=document.createElement('option');option.value=row.version;option.textContent=row.label+' · '+row.savedAt;$('usage-options').append(option);
  }
}
function renderSaved(rows,append=false){
  if(!append)$('saved-list').replaceChildren();
  const wrap=document.createElement('div');
  wrap.innerHTML=table(['Saved review','Route','Period','Observed quantity','Saved-price value USD','Tariff value USD'],
    rows.map(row=>[row.label,row.method+' '+row.path,(row.period.observedFrom??'')+' → '+(row.period.observedUntil??''),
      row.quantity+' · '+row.basis,row.savedValueUsd,row.tariffValueUsd]));
  const tr=wrap.querySelectorAll('tbody tr');
  rows.forEach((row,index)=>{
    const cell=tr[index].children[0],button=document.createElement('button');button.type='button';button.textContent=row.label;
    button.addEventListener('click',()=>action(button,()=>openReview(row.performanceId)));cell.replaceChildren(button);
    const detail=document.createElement('div');detail.className='muted';detail.textContent=row.savedAt;cell.append(detail);
  });
  $('saved-list').append(wrap);
}
async function refresh(){
  workspace=await api('/state');
  options('selection-options',workspace.tariffs.selections.filter(row=>row.status==='SAVED'),
    row=>row.request.selection.pricingInput.label+' · '+row.createdAt,row=>row.requestId);
  $('usage-options').replaceChildren();addSourceOptions(workspace.pricing.items);
  options('service-options',workspace.servicePeriods.items,
    row=>row.label+' · '+row.from+' → '+row.until,row=>row.sourceId);
  sourceAfter=workspace.pricing.nextAfter;reviewAfter=workspace.reviews.nextAfter;
  $('more-sources').hidden=sourceAfter===null;$('more-reviews').hidden=reviewAfter===null;
  renderSaved(workspace.reviews.items);
}
function selectedRouteId(){
  const selection=workspace?.tariffs.selections.find(row=>row.requestId===$('selection-id').value.trim());
  const scenarios=selection?.request.selection.scenarioPlanInput.scenarios;
  return scenarios?.length===1?Object.keys(scenarios[0].routes??{})[0]:null;
}
function renderOptions(){
  const selected=$('option-id').value,routeId=selectedRouteId(),rows=(sourceValue?.routes??[])
    .filter(row=>routeId===null||row.routeId===routeId).flatMap(row=>(row.nativeOptions??[]).map(option=>({...option,path:row.path})));
  $('option-id').innerHTML='<option value="">All matched options for the selected route</option>'+rows.map(row=>
    '<option value="'+e(row.optionId)+'">'+e(row.method+' '+row.path+' · '+row.network+' · '+row.amountAtomic+' atoms · '+row.optionId)+'</option>').join('');
  if(rows.some(row=>row.optionId===selected))$('option-id').value=selected;
  const native=['NATIVE_SUCCESS','INBOX_ACCEPTED'].includes($('basis').value);
  $('option-id').disabled=!native;
  const service=$('basis').value.startsWith('SERVICE_');$('service-id').disabled=!service;
}
async function loadUsage(){
  const version=$('usage-id').value.trim();sourceValue=await api('/source?version='+encodeURIComponent(version));
  $('usage-context').innerHTML='<h3>'+e(sourceValue.label)+'</h3>'+
    table(['Saved version','Saved at','Original observation kind','Report SHA-256'],[[sourceValue.version,sourceValue.savedAt,sourceValue.observationKind,sourceValue.reportSha256]])+
    table(['Route','Method','Path','HTTP 2xx','HTTP 402','Native options'],sourceValue.routes.map(row=>[
      row.routeId,row.method,row.path,row.actual2xx,row.actual402,row.nativeOptions.length]))+
    full('Original period and source coverage',sourceValue.period);
  options('cost-options',sourceValue.costEditions.items,row=>row.label+' · '+JSON.stringify(row.period),row=>row.edition);
  renderOptions();status('Read the complete selected usage review. Choose the observed quantity basis.');
}
function inputs(){
  const basis=$('basis').value;
  return {selectionRequestId:$('selection-id').value.trim(),usageVersion:$('usage-id').value.trim(),basis,
    optionId:['NATIVE_SUCCESS','INBOX_ACCEPTED'].includes(basis)?$('option-id').value||null:null,
    costEdition:$('cost-id').value.trim()||null,costBasis:$('cost-basis').value,
    servicePeriodSourceId:basis.startsWith('SERVICE_')?$('service-id').value.trim()||null:null};
}
function reviewHtml(review){
  const service=review.servicePeriod;
  return '<h3>'+e(review.route.method+' '+review.route.path)+'</h3>'+
    table(['Observed period','Basis','Quantity','Saved uniform USD/request','Value at saved quote USD','Original tariff total USD','Tariff minus saved quote USD'],[
      [(review.period.observedFrom??'')+' → '+(review.period.observedUntil??''),review.basis.label,review.basis.quantity,
        review.quoted.savedUnitUsd,review.quoted.valueAtObservedQuantityUsd,review.tariff.quote.totalUsd,review.tariff.deltaFromSavedQuoteUsd]])+
    '<p>'+e(review.quoted.comparisonBasis==='PER_REQUEST_PRICE_COMPARISON_FOR_OBSERVED_SERVICE_CALLS'?
      'Per-request price comparison for observed service calls. The purchased allowance and its original payment remain separate below.':
      'The saved per-request quote is evaluated at this recorded source quantity.')+'</p>'+
    '<h3>Original tariff bands</h3>'+table(['Band','After quantity','Through quantity','Requests','USD/request','USD subtotal'],
      review.tariff.quote.lines.map(row=>[row.tierIndex+1,row.lowerExclusiveQuantity,row.upTo??'Unbounded',row.quantity,row.unitPriceUsd,row.subtotalUsd]))+
    table(['Derived uniform quote at observed quantity','Uniform value USD','Upward rounding difference USD'],
      [[review.tariff.quote.chosenUniformQuoteUsd,review.tariff.quote.uniformGrossUsd,review.tariff.quote.roundingDeltaUsd]])+
    '<h3>Recorded native payment options</h3><p>'+e(review.route.optionId?'Headline scope: native option '+review.route.optionId:
      'The headline follows its selected route or service basis. Atomic totals below retain each configured payment option.')+'</p>'+
    table(['Scope','Network','Amount per event (atoms)','Matched events','Total atoms','Inbox accepted','Pending','Exhausted','Complete payment identity'],
      review.native.options.map(row=>[review.route.optionId===row.optionId?'Selected':'Original option',row.network,row.amountAtomic,
        row.nativeSuccessEvents,row.nativeAtomicAmount,row.acceptedByMerchantInbox,row.pendingDelivery,row.exhaustedDelivery,
        row.optionId+' / asset '+row.assetDigest+' / recipient '+row.recipientDigest]))+
    '<p>Delivery status comes from the retained delivery-journal snapshot.</p>'+
    '<h3>Cost context</h3>'+table(['Merchant cost per fulfillment USD','Merchant cost per challenge USD','Modeled cost at selected quantity USD','Modeled original HTTP variable cost USD'],
      [[review.costs.estimated.perFulfilledUsd,review.costs.estimated.perChallengeUsd,
        review.costs.estimated.valueAtBasisQuantityUsd,review.costs.estimated.routeHttpVariableUsd]])+
    (review.costs.recorded?'<p>Saved '+e(review.costs.recorded.basis)+' supplier edition '+e(review.costs.recorded.edition)+
      ' · original route coverage '+e(review.costs.recorded.coverage.state)+'</p>'+
      table(['Basis','Currency','Allocated amount','Original source lines'],review.costs.recorded.costs.map(row=>[
        row.basis,row.currency,row.amount,row.lines.join(', ')]))+full('Original recorded-cost period, coverage and proposal',review.costs.recorded):
      '<p>Select a saved cost edition to retain its original supplier amounts and scope alongside the merchant unit assumptions.</p>')+
    (service?'<h3>Purchased service period</h3>'+table(['Original order','Captured from','Captured until','Newly consumed units','Newly admitted units','Released units','Selected route recoveries','Whole-pass recoveries'],[
      [service.orderRef,service.from,service.until,service.route.consumedUnits,service.route.admittedUnits,service.route.releasedUnits,
        service.resultRecoveries,service.passResultRecoveries]])+
      full('Original prepaid entitlement and exact opening/closing allowance',{entitlement:service.entitlement,opening:service.opening,closing:service.closing}):'')+
    (review.timeline.length?'<h3>Recorded days</h3>'+table(['UTC day','Requests','Original time basis'],review.timeline.map(row=>[row.day,row.quantity,row.timeBasis])):'')+
    (review.issues.length?'<h3>Original source findings</h3><ul>'+review.issues.map(row=>'<li>'+e(row.code+': '+row.message)+'</li>').join('')+'</ul>':'')+
    full('Complete saved performance identity and coverage',{source:review.source,route:review.route,period:review.period,
      basis:review.basis,performanceSha256:review.performanceSha256});
}
async function preview(){
  resetPreview();prepared=await api('/preview',inputs());$('preview-result').innerHTML=reviewHtml(prepared.review);
  $('save-controls').hidden=false;status('Performance calculated from the complete original sources. Name and save the review to continue its monthly proposal.');
}
async function save(){
  if(!prepared)throw new Error('Calculate the selected performance before saving.');
  const body={label:$('review-label').value.trim(),performanceSha256:prepared.review.performanceSha256,inputs:prepared.inputs};
  const request={requestId:await stableId('save',body),...body};
  const result=await api('/save',request);await refresh();await openReview(result.performanceId);
  status((result.recovered?'Recovered':'Saved')+' complete performance '+result.performanceId+'.');
}
function renderOperations(value){
  const root=$('operations');root.replaceChildren();
  for(const row of value.operations.proposals){
    const box=document.createElement('div');box.innerHTML='<p>'+e(row.status+' · original tariff proposal '+row.proposalRequestId+' · '+row.createdAt)+'</p>';
    const button=document.createElement('button');button.type='button';button.textContent=row.status==='RESUME'?'Resume original proposal save':'Open current native selection';
    button.addEventListener('click',()=>action(button,async()=>{
      savedProposal=await api('/proposal/save',row.request);proposed=savedProposal.proposal;renderProposal(proposed);renderNativeSelection(savedProposal);
      status('Opened the original saved proposal and its current native selection.');
    }));box.append(button);root.append(box);
  }
  for(const row of value.operations.selections){
    const box=document.createElement('div');box.innerHTML='<p>'+e(row.status+' · native Pricing request '+row.pricingRequestId+' · '+row.createdAt)+'</p>';
    if(row.status==='RESUME'){
      const button=document.createElement('button');button.type='button';button.textContent='Resume original native Pricing save';
      button.addEventListener('click',()=>action(button,async()=>{
        const result=await api('/proposal/commit',row.request);await refresh();await openReview(result.performanceId);
        status('Recovered native Pricing version '+result.result.pricing.version+'.');
      }));box.append(button);
    }else box.insertAdjacentHTML('beforeend',table(['Native Pricing version','Native scenario plan'],[
      [row.result.result.pricing.version,row.result.result.scenarioPlan.planId]]));
    root.append(box);
  }
  if(!root.children.length)root.textContent='No monthly proposal has been saved for this review.';
}
async function openReview(performanceId){
  resetProposal();current=await api('/review?performanceId='+encodeURIComponent(performanceId));
  $('current-section').hidden=false;$('current-title').textContent=current.record.label;
  $('current-result').innerHTML=reviewHtml(current.record.review);$('open-id').value=performanceId;
  $('downloads').replaceChildren();
  for(const name of ['source.json','review.json','review.html','usage.csv']){
    const button=document.createElement('button');button.type='button';button.textContent='Export '+name;
    button.addEventListener('click',()=>action(button,()=>download(performanceId,name)));$('downloads').append(button);
  }
  $('monthly').value='';$('proposal-label').value=(current.record.label+' · monthly proposal').slice(0,100);
  renderOperations(current);status('Opened saved performance '+performanceId+'.');
}
function renderProposal(value){
  const row=value.comparison;
  $('proposal-result').innerHTML='<h3>Explicit monthly proposal</h3>'+
    table(['Recorded source quantity','Prospective monthly requests','Original tariff total USD','Chosen uniform USD/request','Uniform monthly value USD','Rounding difference USD'],[
      [value.observedQuantity,value.proposedMonthlyRequests,row.quote.totalUsd,row.quote.chosenUniformQuoteUsd,row.quote.uniformGrossUsd,row.quote.roundingDeltaUsd]])+
    table(['Preserved original Pricing source','Tariff','Proposal SHA-256'],[[value.sourceVersion,value.tariffId,value.proposalSha256]])+
    '<p>The original complete merchant commercial terms remain the starting point for the native scenario. Review their selected-versus-current values below before saving a Pricing version.</p>'+
    full('Complete native tariff comparison',row);
}
async function propose(){
  if(!current)throw new Error('Open a saved performance review.');
  resetProposal();proposed=await api('/proposal',{performanceId:current.record.performanceId,proposedMonthlyRequests:$('monthly').value.trim()});
  renderProposal(proposed);$('proposal-save-controls').hidden=false;status('Monthly proposal calculated at the explicit prospective request quantity.');
}
function renderNativeSelection(value){
  const selection=value.selection;
  if(!selection){
    $('native-selection').innerHTML='<p class="notice">'+e('The original tariff proposal '+value.plan.planId+' is saved. '+
      (value.selectionError?.message??'Refresh the original Pricing source to obtain its native selection.'))+'</p>';
    $('commit-proposal').hidden=true;return;
  }
  const before=selection.currentPricing.commercial,after=selection.pricingInput.commercial;
  const routeIds=[...new Set([...Object.keys(before.routes),...Object.keys(after.routes)])].sort();
  const rows=[];
  for(const routeId of routeIds)for(const field of ['unitPriceUsd','priceBasis','perFulfilledUsd','perChallengeUsd','monthlyPaidTarget']){
    const previous=before.routes[routeId]?.[field]??null,next=after.routes[routeId]?.[field]??null;
    rows.push([routeId,field,previous,next,JSON.stringify(previous)===JSON.stringify(next)?'Same':'Changes']);
  }
  $('native-selection').innerHTML='<h3>Complete original merchant terms</h3>'+
    table(['Shared monthly fixed cost','Current USD','Selected USD'],[['Whole merchant',before.sharedMonthlyFixedUsd,after.sharedMonthlyFixedUsd]])+
    table(['Route','Field','Current commercial value','Selected commercial value','Effect'],rows)+
    table(['Current Pricing revision','Original selected seller SHA-256','Original captured source SHA-256'],[
      [selection.currentPricing.revision,selection.pricingInput.sellerSha256,selection.pricingInput.snapshotSha256]])+
    full('Original scenario and native Pricing preview',{scenarioReview:selection.scenarioReview,pricingPreview:selection.pricingPreview,observed:selection.observed});
  $('commit-proposal').hidden=false;
}
async function saveProposal(){
  if(!proposed)throw new Error('Review the explicit monthly proposal.');
  const body={performanceId:proposed.performanceId,proposedMonthlyRequests:proposed.proposedMonthlyRequests,
    proposalSha256:proposed.proposalSha256,label:$('proposal-label').value.trim()};
  savedProposal=await api('/proposal/save',{...body,requestId:await stableId('proposal-save',body)});
  renderNativeSelection(savedProposal);$('proposal-save-controls').hidden=true;
  const value=await api('/review?performanceId='+encodeURIComponent(proposed.performanceId));renderOperations(value);
  status('Saved original tariff plan '+savedProposal.plan.planId+'. Review the complete commercial values for its native Pricing version.');
}
async function commitProposal(){
  if(!savedProposal?.selection)throw new Error('Review the full original native selection before saving.');
  const body={performanceId:savedProposal.performanceId,proposalRequestId:savedProposal.proposalRequestId,selection:savedProposal.selection};
  const planRequestId=await stableId('proposal-scenario',body),pricingRequestId=await stableId('proposal-pricing',body);
  const result=await api('/proposal/commit',{...body,planRequestId,pricingRequestId});
  await refresh();await openReview(result.performanceId);
  status('Saved original native Pricing version '+result.result.pricing.version+' and scenario '+result.result.scenarioPlan.planId+'. The same saved tariff selection can now supply the revised Commercial quote.');
}
async function captureService(){
  const opening=$('service-opening').files[0],closing=$('service-closing').files[0];
  if(!opening||!closing)throw new Error('Select both complete original service snapshots.');
  const body={label:$('service-label').value.trim(),opening:{name:opening.name,text:await opening.text()},closing:{name:closing.name,text:await closing.text()}};
  const result=await api('/service-periods',{requestId:await stableId('service-capture',body),...body});
  $('service-result').innerHTML=table(['Saved source','Opening capture','Closing capture','Original order'],[
    [result.sourceId,result.from,result.until,result.orderRef]])+table(['Route','Method','Path','Consumed units','Result recoveries'],
    result.routes.map(row=>[row.routeId,row.method,row.path,row.consumedUnits,row.resultRecoveries]));
  await refresh();$('service-id').value=result.sourceId;$('basis').value='SERVICE_CONSUMED_REQUESTS';renderOptions();resetPreview();
  status('Captured both original service snapshots and their exact period comparison.');
}
async function inspectSource(){
  const file=$('receive-file').files[0];if(!file)throw new Error('Select the complete exported performance source.');
  received=JSON.parse(await file.text());const result=await api('/inspect',received);
  $('receive-result').innerHTML=reviewHtml(result.review)+table(['Complete retained file','Bytes','Original SHA-256'],
    result.files.map(row=>[row.name,row.bytes,row.sha256]));
  $('receive-source').disabled=false;status('The complete performance source matches its original retained calculations and file identities.');
}
async function receiveSource(){
  if(!received)throw new Error('Inspect the complete performance source first.');
  const result=await api('/receive',received);await refresh();await openReview(result.performanceId);
  status('Received complete performance '+result.performanceId+'.');
}
for(const [name,run]of Object.entries({refresh:async()=>{await refresh();status('Refreshed saved original sources and performance.');},
  'load-usage':loadUsage,preview,'save-review':save,'open-review':()=>openReview($('open-id').value.trim()),
  proposal,'save-proposal':saveProposal,'commit-proposal':commitProposal,'capture-service':captureService,
  'inspect-source':inspectSource,'receive-source':receiveSource})){
  $(name).addEventListener('click',()=>action($(name),run));
}
$('more-sources').addEventListener('click',()=>action($('more-sources'),async()=>{
  const result=await api('/sources?after='+encodeURIComponent(sourceAfter)+'&limit=50');addSourceOptions(result.items);
  sourceAfter=result.nextAfter;$('more-sources').hidden=sourceAfter===null;
}));
$('more-reviews').addEventListener('click',()=>action($('more-reviews'),async()=>{
  const result=await api('/reviews?after='+encodeURIComponent(reviewAfter)+'&limit=50');renderSaved(result.items,true);
  reviewAfter=result.nextAfter;$('more-reviews').hidden=reviewAfter===null;
}));
for(const name of ['selection-id','usage-id','basis','option-id','cost-id','cost-basis','service-id']){
  $(name).addEventListener('input',()=>{resetPreview();if(['selection-id','basis'].includes(name))renderOptions();});
}
$('monthly').addEventListener('input',resetProposal);
$('receive-file').addEventListener('change',()=>{received=null;$('receive-source').disabled=true;$('receive-result').replaceChildren();});
async function boot(){
  $('native-nav').hidden=!integrated;
  if(integrated){
    const response=await fetch('/api/state'),value=await response.json();
    if(!response.ok||typeof value.token!=='string')throw new Error('Open the original Pricing workspace and its private session.');
    token=value.token;
  }else{
    const fragment=new URLSearchParams(location.hash.slice(1));token=fragment.get('token')??sessionStorage.getItem(TOKEN_KEY)??'';
    if(!/^[a-f0-9]{64}$/.test(token))throw new Error('Open the complete private performance launch URL.');
    sessionStorage.setItem(TOKEN_KEY,token);history.replaceState(null,'',location.pathname);
  }
  renderOptions();await refresh();status('Choose an original completed tariff selection and a saved usage review.');
}
await boot().catch(failed);
