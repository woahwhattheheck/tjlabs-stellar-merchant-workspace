// MIT. Private merchant tariff operator. Exact requests stay attached to their reviews.
const $ = id => document.getElementById(id);
const integrated = location.pathname.startsWith('/tariffs/');
const api = integrated ? '/api/tariffs' : '/api';
const storageKey = 'merchant-tariffs:' + location.origin + location.pathname;
const sessionKey = storageKey + ':session';
let token = new URLSearchParams(location.hash.slice(1)).get('token');
if (token) {
  try { sessionStorage.setItem(sessionKey,token); } catch {}
  history.replaceState(null,'',location.pathname+location.search);
}
try { token ||= sessionStorage.getItem(sessionKey); } catch {}
if (!integrated) $('pricing-link').hidden = true;
let busy=false, state=null, source=null, activePreview=null, activePlan=null, selection=null;
let priceSource=null, priceInput=null, pricePreview=null, priceDecision=null, priceSaveRequest=null;
let draft = {version:'',label:'Monthly tariff comparison',volumes:'0, 100, 1000, 10000',tariffs:[]};
let pendingSave=null, pendingCommit=null;
function persist() { retainBrowserStudy(); }

function message(text,error=false) {
  $('status').textContent=text; $('status').dataset.error=String(error);
}
async function run(fn) {
  if (busy) return;
  busy=true; document.querySelector('main').inert=true;
  try { await fn(); } catch(error) { message((error.code ? error.code+': ' : '')+error.message,true); }
  finally { busy=false; document.querySelector('main').inert=false; }
}
function headers(json=false) {
  return {...(integrated?{'x-sf97-workspace':token ?? ''}:{Authorization:'Bearer '+(token ?? '')}),
    ...(json?{'Content-Type':'application/json'}:{})};
}
async function request(path,input) {
  const response=await fetch(api+path,{method:input===undefined?'GET':'POST',headers:headers(input!==undefined),
    body:input===undefined?undefined:JSON.stringify(input),cache:'no-store',redirect:'error'});
  const text=await response.text();
  let value;
  try { value=JSON.parse(text); } catch { throw new Error('The server returned an incomplete JSON response. Refresh or resume the retained request.'); }
  if (!response.ok) {
    const detail=value.error ?? value;
    throw Object.assign(new Error(detail.message ?? 'Workspace request failed.'),{code:detail.code,status:response.status});
  }
  return value;
}
function node(tag,text,className) {
  const result=document.createElement(tag);
  if (text!==undefined) result.textContent=String(text);
  if (className) result.className=className;
  return result;
}
function button(text,action,className) {
  const result=node('button',text,className); result.type='button'; result.addEventListener('click',()=>run(action)); return result;
}
function inputField(label,value,onChange,{type='text',placeholder='',readOnly=false,maxLength}={}) {
  const wrapper=node('label',label), input=document.createElement('input');
  input.type=type; input.value=value ?? ''; input.placeholder=placeholder; input.readOnly=readOnly;
  if (maxLength) input.maxLength=maxLength;
  input.addEventListener('input',()=>onChange(input.value));
  wrapper.append(input); return wrapper;
}
function selectField(label,value,choices,onChange) {
  const wrapper=node('label',label), select=document.createElement('select');
  for (const [id,text] of choices) {const option=node('option',text);option.value=id;select.append(option);}
  select.value=value; select.addEventListener('change',()=>onChange(select.value));wrapper.append(select);return wrapper;
}
const valueText = value => value === null || value === undefined ? 'Unknown' : String(value);
const amount = value => value === null || value === undefined ? 'Unknown' : '$'+value;
const pretty = value => JSON.stringify(value,null,2);
function resetPreview() {
  if(!bootStudyRestore&&!restoringStudy)localPlanId=null;
  activePreview=null; activePlan=null; selection=null; $('save-plan').disabled=true;
  $('selection-section').hidden=true; $('commit-selection').disabled=true;
  $('download-plan').disabled=true; $('download-csv').disabled=true;
  for (const button of $('comparison-table').querySelectorAll('button')) button.disabled=true;
  $('calculate').textContent='Calculate comparison';
  persist();
}
function newTariff() {
  const route=source?.routes?.[0], routeId=route?.routeId ?? '';
  const price=source?.commercial?.routes?.[routeId]?.unitPriceUsd || '0.01';
  let number=1; while(draft.tariffs.some(row=>row.id==='tariff-'+number))number++;
  return {id:'tariff-'+number,label:'Tariff '+number,routeId,mode:'graduated',
    tiers:[{upTo:'1000',unitPriceUsd:price},{upTo:null,unitPriceUsd:price}]};
}
function renderEditors() {
  const root=$('tariff-editors'); root.replaceChildren();
  const choices=(source?.routes ?? []).map(route=>[route.routeId,route.method+' '+route.path+' / '+route.routeId]);
  draft.tariffs.forEach((tariff,index)=>{
    const card=node('div',undefined,'tariff-card'), heading=node('div',undefined,'card-heading');
    heading.append(node('h3','Tariff '+(index+1)),button('Remove',async()=>{
      draft.tariffs.splice(index,1);resetPreview();renderEditors();
    },'small'));
    const fields=node('div',undefined,'field-grid');
    const update=(key,value)=>{tariff[key]=value;resetPreview();};
    fields.append(inputField('ID',tariff.id,value=>update('id',value),{maxLength:64}),
      inputField('Name',tariff.label,value=>update('label',value),{maxLength:120}),
      selectField('Route',tariff.routeId,choices,value=>update('routeId',value)),
      selectField('Mode',tariff.mode,[['graduated','Graduated'],['volume','Volume']],value=>update('mode',value)));
    const table=node('table',undefined,'tier-table'), head=node('thead'), headRow=node('tr');
    for(const title of ['Requests through','USD per request',''])headRow.append(node('th',title));
    head.append(headRow);table.append(head);
    const body=node('tbody');
    tariff.tiers.forEach((tier,tierIndex)=>{
      const tr=node('tr'), upper=node('td'), price=node('td'), controls=node('td');
      const limit=document.createElement('input');limit.inputMode='numeric';limit.value=tier.upTo ?? '';
      limit.placeholder=tier.upTo===null?'Unlimited':'';limit.readOnly=tier.upTo===null;
      limit.setAttribute('aria-label','Tariff '+(index+1)+' tier '+(tierIndex+1)+' upper quantity');
      limit.addEventListener('input',()=>{tier.upTo=limit.value;resetPreview();});upper.append(limit);
      const rate=document.createElement('input');rate.inputMode='decimal';rate.value=tier.unitPriceUsd;
      rate.setAttribute('aria-label','Tariff '+(index+1)+' tier '+(tierIndex+1)+' USD price');
      rate.addEventListener('input',()=>{tier.unitPriceUsd=rate.value;resetPreview();});price.append(rate);
      if(tier.upTo!==null)controls.append(button('Remove',async()=>{
        tariff.tiers.splice(tierIndex,1);resetPreview();renderEditors();
      },'small'));
      tr.append(upper,price,controls);body.append(tr);
    });
    table.append(body);
    card.append(heading,fields,table,button('Add band',async()=>{
      let previous='0';
      if(tariff.tiers.length>1)previous=String(tariff.tiers.at(-2).upTo);
      let next='1000';try{next=String(BigInt(previous)+1000n);}catch{}
      tariff.tiers.splice(tariff.tiers.length-1,0,{upTo:next,unitPriceUsd:tariff.tiers.at(-1)?.unitPriceUsd ?? '0.01'});
      resetPreview();renderEditors();
    },'small'));
    root.append(card);
  });
  $('add-tariff').disabled=!source || draft.tariffs.length>=12;
}
function formInput() {
  return {version:$('source-version').value,tariffs:structuredClone(draft.tariffs),
    volumes:$('volumes').value.split(/[,\s]+/).filter(Boolean)};
}
function optionList(select,historyRows,selected) {
  select.replaceChildren();
  const empty=node('option','Choose a saved pricing review');empty.value='';select.append(empty);
  for(const row of historyRows) {
    const option=node('option',row.label+' — '+new Date(row.savedAt).toLocaleString());option.value=row.version;select.append(option);
  }
  select.value=historyRows.some(row=>row.version===selected)?selected:'';
}
function renderPlans() {
  const root=$('saved-plans');root.className='';root.replaceChildren();
  const plans=state?.tariffs?.plans ?? [];
  if(!plans.length)root.append(node('p','No tariff plans saved yet.','muted'));
  for(const plan of plans) {
    const item=node('div',undefined,'saved-item');
    item.append(button(plan.label,()=>openPlan(plan.planId)),node('small',new Date(plan.savedAt).toLocaleString()),
      node('small',plan.tariffCount+' tariffs / '+plan.comparisonCount+' comparisons'));
    root.append(item);
  }
  renderOperations();
}
function renderOperations() {
  const root=$('operations');root.replaceChildren();
  if(pendingSave)root.append(button('Resume retained tariff save',()=>saveBody(pendingSave),'small'));
  if(pendingCommit)root.append(button('Resume retained quote save',()=>commitBody(pendingCommit),'small'));
  if(priceSaveRequest)root.append(button('Resume price decision save',async()=>{
    await retainBeforeNative();
    priceDecision=await request('/repricing/save',priceSaveRequest);priceSaveRequest=null;persist();
    await retainAfterNative();
    renderPriceDecision();await reload(false);message('The original price decision is saved.');
  },'small'));
  for(const operation of state?.tariffs?.selections ?? []) {
    const item=node('div',undefined,'saved-item');
    item.append(node('strong',operation.status==='SAVED'?'Pricing review saved':'Quote save retained'),
      node('small',new Date(operation.createdAt).toLocaleString()));
    if(operation.status==='RESUME')item.append(button('Resume original request',async()=>{
      pendingCommit=operation.request;persist();await commitBody(pendingCommit);
    },'small'));
    else if(operation.result?.pricing?.version)item.append(button('Open native amounts',async()=>{
      $('repricing-version').value=operation.result.pricing.version;await loadPrices();
    },'small'));
    root.append(item);
  }
  for(const decision of state?.pricing?.repricing?.history ?? []) {
    const item=node('div',undefined,'saved-item');
    item.append(button('Price decision: '+decision.label,async()=>{
      priceDecision=structuredClone(decision);priceInput=null;pricePreview=null;
      renderPriceDecision();
      $('price-preview').replaceChildren(node('h3','Saved native amount decision'),
        node('p',decision.label+' / '+decision.changedPaymentOptions+' payment options'),
        ...(decision.release?[node('p','The retained seller release is available.'),node('pre',pretty(decision.release))]:[]));
      $('price-downloads').scrollIntoView({behavior:'smooth',block:'center'});
      message('Saved price decision opened. Its original files and release continuation are available.');
    },'small'),node('small',new Date(decision.savedAt).toLocaleString()));
    root.append(item);
  }
  if(!root.children.length)root.append(node('p','No saved or pending operations.','muted'));
  $('resume-save').hidden=!pendingSave;
}
async function reload(loadSource=true) {
  if(integrated && !token) {
    const response=await fetch('/api/state',{cache:'no-store',redirect:'error'});
    if(!response.ok)throw new Error('Open the original Pricing workspace to initialize this session.');
    token=(await response.json()).token;
  }
  state=await request('/state');
  restoreLocalStudy();
  const rows=state.pricing.history ?? [], prior=$('source-version').value || draft.version;
  optionList($('source-version'),rows,prior || rows[0]?.version);
  if(prior)ensureSourceOption($('source-version'),prior,source?.label);
  const selected=$('repricing-version').value;
  optionList($('repricing-version'),rows,selected || rows[0]?.version);
  renderPlans();
  if(loadSource)await loadSourceVersion();
  await refreshStudies();
}
async function loadSourceVersion() {
  const version=$('source-version').value;draft.version=version;resetPreview();
  if(!version) {
    source=null;renderEditors();
    $('source-summary').textContent='Save an initial review in the original Pricing workspace, then refresh this list.';
    $('calculate').disabled=true;persist();return;
  }
  source=await request('/source?version='+encodeURIComponent(version));
  $('source-summary').replaceChildren(node('strong',source.label),
    node('p',source.routes.length+' selected routes. '+(source.sellerChanged?'The current seller has changed; this source remains available for historical comparison.':'The saved seller matches the current configuration.')),
    node('small','Original operations: '+(source.observation?.kind ?? 'saved source')+
      (source.observation?.range?' / '+pretty(source.observation.range):'')));
  if(!draft.tariffs.length)draft.tariffs.push(newTariff());
  $('calculate').disabled=false;renderEditors();persist();
}
function renderComparison(review) {
  const table=$('comparison-table'), body=table.querySelector('tbody');body.replaceChildren();table.hidden=false;
  $('comparison-empty').hidden=true;
  const names=new Map(review.tariffs.map(tariff=>[tariff.id,tariff.label]));
  for(const row of review.comparisons) {
    const tr=node('tr'), name=node('td',names.get(row.tariffId) ?? row.tariffId);
    name.append(node('span',row.routeId,'muted'));tr.append(name);
    for(const value of [row.quantity,row.quote.totalUsd,row.grossDeltaUsd,row.contributionBeforeFixedUsd,
      row.quote.chosenUniformQuoteUsd,row.quote.roundingDeltaUsd])tr.append(node('td',valueText(value)));
    const action=node('td'), choose=button('Review',async()=>{
      if(!activePlan || activePlan.review.tariffReviewSha256!==review.tariffReviewSha256)
        throw new Error('Save this comparison before choosing its fixed quote.');
      selection=await request('/selection',{planId:activePlan.planId,comparisonId:row.id});
      renderSelection();$('selection-section').scrollIntoView({behavior:'smooth',block:'start'});
      message('Review the exact fixed quote and complete commercial terms before saving.');
    },'small');
    choose.disabled=!row.scenario || !activePlan || activePlan.review.tariffReviewSha256!==review.tariffReviewSha256;
    action.append(choose);tr.append(action);body.append(tr);
  }
  const notices=$('boundary-notices');notices.replaceChildren();
  for(const detail of review.tariffDetails ?? [])for(const boundary of detail.boundaries ?? []) {
    if(boundary.decreasesGross)notices.append(node('p',
      (names.get(detail.tariffId) ?? detail.tariffId)+': monthly total decreases at this volume boundary. '+pretty(boundary),'notice'));
  }
}
async function calculate() {
  const input=formInput();message('Calculating exact tariff totals…');
  const result=await request('/preview',input);activePreview={input,result};activePlan=null;selection=null;
  $('selection-section').hidden=true;
  $('save-plan').disabled=JSON.stringify(formInput())!==JSON.stringify(input);
  $('download-plan').disabled=true;$('download-csv').disabled=true;$('print-plan').disabled=false;
  renderComparison(result.review);
  $('saved-plan-status').textContent='Calculated from '+result.sourceLabel+'. Save to retain these inputs and results.';
  message('Comparison calculated. '+result.review.comparisons.length+' exact quantity outcomes.');
}
async function saveBody(body) {
  pendingSave=structuredClone(body);persist();renderOperations();
  await retainBeforeNative();
  const result=await request('/plans',pendingSave);
  activePlan=result.record;pendingSave=null;persist();
  await retainAfterNative();
  $('saved-plan-status').textContent='Saved '+activePlan.label+' — '+new Date(activePlan.savedAt).toLocaleString();
  $('download-plan').disabled=false;$('download-csv').disabled=false;$('save-plan').disabled=true;
  renderComparison(activePlan.review);await reload(false);
  message(result.recovered?'The original tariff save was recovered.':'Tariff plan saved.');
}
async function savePlan() {
  if(pendingSave)return saveBody(pendingSave);
  if(!activePreview || JSON.stringify(formInput())!==JSON.stringify(activePreview.input))
    throw new Error('Calculate the current tariff inputs before saving.');
  const body={...structuredClone(activePreview.input),requestId:crypto.randomUUID(),label:$('plan-label').value,
    tariffReviewSha256:activePreview.result.review.tariffReviewSha256};
  if(pendingSave && pendingSave.tariffReviewSha256===body.tariffReviewSha256 && pendingSave.label===body.label)
    body.requestId=pendingSave.requestId;
  await saveBody(body);
}
async function openPlan(planId) {
  await saveBeforeSwitch();
  study=null;studyRequest=null;localPlanId=null;pendingSave=null;pendingCommit=null;priceSaveRequest=null;
  paymentDraft={version:null,valuations:[]};priceSource=null;
  priceInput=null;pricePreview=null;priceDecision=null;
  $('valuation-rows').replaceChildren();$('price-preview').replaceChildren();$('price-downloads').replaceChildren();
  $('preview-prices').disabled=true;$('save-prices').disabled=true;$('stage-prices').disabled=true;
  $('study-label').value='Study from saved tariff plan';$('study-history').replaceChildren();
  activePlan=await request('/plans/'+encodeURIComponent(planId));activePreview=null;selection=null;
  draft={version:activePlan.version,label:activePlan.label,volumes:activePlan.inputs.volumes.join(', '),
    tariffs:structuredClone(activePlan.inputs.tariffs)};
  $('plan-label').value=draft.label;$('volumes').value=draft.volumes;
  $('source-version').value=draft.version;
  if(!$('source-version').value){const option=node('option',activePlan.sourceLabel+' (retained source)');option.value=draft.version;$('source-version').append(option);$('source-version').value=draft.version;}
  source=await request('/source?version='+encodeURIComponent(draft.version));
  $('source-summary').textContent=source.label+' / '+source.routes.length+' selected routes'+(source.sellerChanged?' / current seller changed':'');
  renderEditors();renderComparison(activePlan.review);persist();
  $('selection-section').hidden=true;$('save-plan').disabled=true;$('download-plan').disabled=false;
  $('download-csv').disabled=false;$('print-plan').disabled=false;
  $('saved-plan-status').textContent='Opened '+activePlan.label+'. Editing creates a new saved plan.';
  message('Saved tariff plan opened.');
}
function renderSelection() {
  $('selection-section').hidden=false;
  const row=selection.comparison, metrics=$('selection-summary');metrics.replaceChildren();
  for(const [label,value] of [['Exact tariff total',amount(row.quote.totalUsd)],['Uniform quote / request',amount(row.quote.chosenUniformQuoteUsd)],
    ['Uniform quote total',amount(row.quote.uniformGrossUsd)],['Upward rounding difference',amount(row.quote.roundingDeltaUsd)],
    ['Monthly requests',row.quantity],['Contribution before fixed cost',amount(row.uniformProjection.contributionBeforeFixedUsd)]]) {
    const metric=node('div',undefined,'metric');metric.append(node('strong',value),node('span',label));metrics.append(metric);
  }
  $('selection-context').textContent='Tariff source: '+(activePlan?.sourceLabel ?? selection.scenarioPlanInput.version)+
    '. Current pricing review: '+(selection.currentPricing?.latest?.label ?? 'first review')+
    '. The captured operations and current revision are attached to this save.';
  const body=$('selection-terms').querySelector('tbody');body.replaceChildren();
  const commercial=selection.pricingInput.commercial,current=selection.currentPricing?.commercial;
  for(const [routeId,term] of Object.entries(commercial.routes)) {
    const tr=node('tr');tr.append(node('td',routeId));
    for(const key of ['unitPriceUsd','perFulfilledUsd','perChallengeUsd','monthlyPaidTarget'])tr.append(node('td',valueText(term[key])));
    const changed=['unitPriceUsd','priceBasis','perFulfilledUsd','perChallengeUsd','monthlyPaidTarget'].filter(key=>current?.routes?.[routeId]?.[key]!==term[key]);
    tr.append(node('td',changed.length?changed.join(', '):'Unchanged','change'));body.append(tr);
  }
  $('fixed-cost-summary').textContent='Shared monthly fixed cost: '+amount(commercial.sharedMonthlyFixedUsd)+
    (current && current.sharedMonthlyFixedUsd!==commercial.sharedMonthlyFixedUsd?' (current: '+amount(current.sharedMonthlyFixedUsd)+')':'')+
    '. Merchant: '+commercial.merchantName+'.';
  $('selection-detail').textContent=pretty({sourceSelection:selection.sourceSelection,observed:selection.observed,
    scenario:selection.scenarioReview,pricingPreview:selection.pricingPreview});
  $('commit-selection').disabled=false;$('commit-result').textContent='';
}
async function commitBody(body) {
  pendingCommit=structuredClone(body);persist();renderOperations();
  await retainBeforeNative();
  const result=await request('/selection/commit',pendingCommit);
  pendingCommit=null;persist();
  await retainAfterNative();
  $('commit-result').textContent='Saved pricing review '+result.pricing.label+'. Its scenario and original capture are retained.';
  $('commit-selection').disabled=true;
  await reload(false);$('repricing-version').value=result.pricing.version;
  message(result.recovered?'The original scenario and pricing save were recovered.':'Scenario and pricing review saved.');
}
async function commitSelection() {
  if(pendingCommit)return commitBody(pendingCommit);
  if(!selection)throw new Error('Review a saved tariff comparison first.');
  const body={selection:structuredClone(selection),planRequestId:crypto.randomUUID(),pricingRequestId:crypto.randomUUID()};
  if(pendingCommit?.selection?.selectionSha256===selection.selectionSha256)await commitBody(pendingCommit);
  else await commitBody(body);
}
function localDownload(name,bytes,type='application/json') {
  const url=URL.createObjectURL(new Blob([bytes],{type})), anchor=document.createElement('a');
  anchor.href=url;anchor.download=name;document.body.append(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),10000);
}
async function serverDownload(path,name) {
  const response=await fetch(api+path,{headers:headers(),cache:'no-store',redirect:'error'});
  if(!response.ok) {let detail;try{detail=await response.json();}catch{}throw new Error(detail?.error?.message ?? detail?.message ?? 'Download failed.');}
  localDownload(name,await response.arrayBuffer(),response.headers.get('content-type') ?? 'application/octet-stream');
}
async function loadPrices() {
  if(!restoringStudy&&priceSaveRequest&&$('repricing-version').value!==priceSaveRequest.version)
    throw new Error('Recover the retained price request, or start a new study before changing its payment source.');
  const version=$('repricing-version').value;if(!version)throw new Error('Choose a saved pricing review.');
  const result=await request('/repricing/source?version='+encodeURIComponent(version));
  if($('repricing-version').value!==version)return;
  priceSource=result;priceInput=null;pricePreview=null;priceDecision=null;
  $('price-preview').replaceChildren();$('price-downloads').replaceChildren();
  $('preview-prices').disabled=false;$('save-prices').disabled=true;$('stage-prices').disabled=true;
  const root=$('valuation-rows');root.replaceChildren();
  root.append(node('p',result.label+(result.sellerChanged?' / seller changed: save a review of its current configuration before repricing.':''),'source-summary'));
  for(const route of result.routes)route.paymentOptions.forEach((option,paymentIndex)=>{
    const card=node('div',undefined,'valuation');
    card.dataset.routeId=route.routeId;card.dataset.paymentIndex=String(paymentIndex);card.dataset.expectedAmount=option.atomicAmount;
    const title=node('label'), enabled=document.createElement('input');enabled.type='checkbox';enabled.className='enabled';
    enabled.checked=selection?route.routeId===selection.comparison.routeId:false;
    title.append(enabled,document.createTextNode(route.routeId+' / payment option '+paymentIndex));
    card.append(title,node('p',option.network+' / '+option.asset+' / receiver '+option.payTo,'binding'),
      node('p','Current amount: '+option.atomicAmount+' atomic units. Saved quote: '+amount(result.commercial.routes[route.routeId].unitPriceUsd),'muted'));
    const fields=node('div',undefined,'field-grid');
    const units=inputField('Atomic units valued','',()=>invalidatePrices(),{placeholder:'Explicit positive integer'});
    units.querySelector('input').className='atomic-units';
    const usd=inputField('Value in USD','',()=>invalidatePrices(),{placeholder:'Explicit decimal value'});
    usd.querySelector('input').className='valuation-usd';
    const basis=inputField('Valuation source or assumption','',()=>invalidatePrices(),{placeholder:'Basis for this value',maxLength:300});
    basis.querySelector('input').className='valuation-basis';
    fields.append(units,usd,basis);card.append(fields);root.append(card);
    enabled.addEventListener('change',invalidatePrices);
  });
  if(!restoringStudy){capturePaymentDraft();persist();}
  message('Original payment options loaded. Enter explicit valuation inputs.');
}
function invalidatePrices() {
  priceInput=null;pricePreview=null;priceDecision=null;$('save-prices').disabled=true;$('stage-prices').disabled=true;
  persist();
}
function quoteValuations() {
  return [...$('valuation-rows').querySelectorAll('.valuation')].filter(card=>card.querySelector('.enabled').checked).map(card=>({
    routeId:card.dataset.routeId,paymentIndex:Number(card.dataset.paymentIndex),expectedAmount:card.dataset.expectedAmount,
    atomicUnits:card.querySelector('.atomic-units').value,usd:card.querySelector('.valuation-usd').value,
    basis:card.querySelector('.valuation-basis').value
  }));
}
async function previewPrices() {
  if(!priceSource)throw new Error('Load the original payment options first.');
  const input={version:priceSource.version,sellerSha256:priceSource.sellerSha256,quoteValuations:quoteValuations()};
  if(!input.quoteValuations.length)throw new Error('Select at least one payment option.');
  const result=await request('/repricing/preview',input);
  if(JSON.stringify(quoteValuations())!==JSON.stringify(input.quoteValuations))throw new Error('Valuation inputs changed. Review the current inputs again.');
  priceInput=input;pricePreview=result;
  $('price-preview').replaceChildren(node('h3','Native amount changes'),node('pre',pretty(result)));
  $('save-prices').disabled=false;message('Native amounts reviewed. The original seller and price decision revision remain bound.');
}
function renderPriceDecision() {
  $('stage-prices').disabled=!(priceDecision?.sourcePackageAvailable &&
    (priceSource?.releaseAvailable ?? state?.pricing?.repricing?.releaseAvailable));
  $('save-prices').disabled=true;
  const root=$('price-downloads');root.replaceChildren();
  if(!priceDecision)return;
  root.append(node('p','Saved decision: '+priceDecision.label,'muted'));
  for(const name of priceDecision.files ?? ['manifest.json'])root.append(button('Download '+name,()=>serverDownload(
    '/repricing/'+priceDecision.decision+'/files/'+encodeURIComponent(name),name.split('/').at(-1)),'small'));
}
async function savePrices() {
  if(priceSaveRequest) {
    message('Resuming the retained native price decision…');
    await retainBeforeNative();
    priceDecision=await request('/repricing/save',priceSaveRequest);priceSaveRequest=null;persist();
    await retainAfterNative();
    renderPriceDecision();await reload(false);message('The retained native price decision is saved.');return;
  }
  if(!priceInput || !pricePreview)throw new Error('Review current native amounts first.');
  if(JSON.stringify(quoteValuations())!==JSON.stringify(priceInput.quoteValuations))throw new Error('Valuations changed. Review the current inputs again.');
  priceSaveRequest={...structuredClone(priceInput),requestId:crypto.randomUUID(),
    expectedRevision:priceSource.repricingRevision,label:(priceSource.label+' / native amounts').slice(0,100),
    reviewSha256:pricePreview.reviewSha256};
  persist();renderOperations();
  await retainBeforeNative();
    priceDecision=await request('/repricing/save',priceSaveRequest);priceSaveRequest=null;persist();
    await retainAfterNative();
  renderPriceDecision();await reload(false);message('Native price decision saved.');
}
async function stagePrices() {
  if(!priceDecision)throw new Error('Save the reviewed price decision first.');
  const result=await request('/repricing/stage',{decision:priceDecision.decision,reviewSha256:priceDecision.reviewSha256});
  $('price-preview').append(node('h3','Retained release'),node('pre',pretty(result)));
  $('stage-prices').disabled=true;message('The original retained seller release is staged.');
}

/* Native named studies. Browser recovery is scoped to this original workspace. */
let localPlanId=null,bootStudyRestore=true;
let study=null,studyRequest=null,studyImportRequest=null,studyDirty=false,studyReady=false,studyRows=[],restoringStudy=false;
let paymentDraft={version:null,valuations:[]},studyStorage=null;
const legacyStudyKey=storageKey;
function studyDocument() {
  capturePaymentDraft();
  return {label:$('study-label').value,draft:structuredClone(draft),
    pendingSave:structuredClone(pendingSave),pendingCommit:structuredClone(pendingCommit),
    priceSaveRequest:structuredClone(priceSaveRequest),repricing:structuredClone(paymentDraft),
    activePlanId:activePlan?.version===draft.version?activePlan.planId:localPlanId};
}
function capturePaymentDraft() {
  if(!priceSource)return;
  paymentDraft={version:priceSource.version,valuations:[...$('valuation-rows').querySelectorAll('.valuation')].map(card=>({
    routeId:card.dataset.routeId,paymentIndex:Number(card.dataset.paymentIndex),expectedAmount:card.dataset.expectedAmount,
    enabled:card.querySelector('.enabled').checked,atomicUnits:card.querySelector('.atomic-units').value,
    usd:card.querySelector('.valuation-usd').value,basis:card.querySelector('.valuation-basis').value
  }))};
}
function retainBrowserStudy() {
  if(!studyReady||restoringStudy)return;
  studyDirty=true;capturePaymentDraft();
  try {
    localStorage.setItem(studyStorage,JSON.stringify({document:studyDocument(),study,studyRequest,studyImportRequest}));
    $('study-local-status').textContent='Browser recovery saved for this workspace.';
  } catch {
    $('study-local-status').textContent='Browser recovery could not be saved. Save this study to the workspace or download the raw inputs.';
  }
  renderStudyStatus();
}
function pendingNative(){return Boolean(pendingSave||pendingCommit||priceSaveRequest);}
function renderStudyStatus() {
  $('study-status').textContent=studyRequest?'A native study save is awaiting its original response. Recover it before saving newer inputs.':
    study?(studyDirty?'Unsaved changes in ':'Saved study: ')+study.label+' / '+study.revision.slice(0,12):
      'New study. Partial quantities and prices can be saved before calculation.';
  $('study-save').disabled=!source;
  $('study-fork').disabled=!source||Boolean(studyRequest);
  $('study-recover').hidden=!studyRequest;
  $('study-recover-import').hidden=!studyImportRequest;
  $('study-export').disabled=!study;
}
function ensureSourceOption(select,version,label) {
  if(!version)return;
  if(![...select.options].some(option=>option.value===version)) {
    const option=node('option',label||version+' (retained source)');option.value=version;select.append(option);
  }
  select.value=version;
}
function restoreLocalStudy() {
  if(studyReady)return;
  studyStorage=storageKey+':workspace:'+state.workspaceId;studyReady=true;
  let value=null;
  try{value=JSON.parse(localStorage.getItem(studyStorage)??'null');}catch{}
  if(value?.document) {
    const document=value.document;
    localPlanId=document.activePlanId??null;
    draft=structuredClone(document.draft);pendingSave=document.pendingSave;pendingCommit=document.pendingCommit;
    priceSaveRequest=document.priceSaveRequest;paymentDraft=document.repricing??{version:null,valuations:[]};
    study=value.study??null;studyRequest=value.studyRequest??null;studyImportRequest=value.studyImportRequest??null;studyDirty=true;
    $('study-label').value=document.label??'Tariff study';
    $('plan-label').value=draft.label;$('volumes').value=draft.volumes;
  }
  let legacy=false;try{legacy=Boolean(localStorage.getItem(legacyStudyKey));}catch{}
  $('study-legacy').hidden=!legacy;
  renderStudyStatus();
}
async function refreshStudies() {
  const value=await request('/working');studyRows=value.copies;
  const list=$('study-list');list.replaceChildren();
  if(!studyRows.length)list.append(node('p','No named studies yet.','muted'));
  for(const row of studyRows) {
    const item=node('div',undefined,'saved-item');
    item.append(button(row.label,()=>openStudy({workingCopyId:row.workingCopyId})),
      node('small',row.tariffCount+' tariffs / '+new Date(row.savedAt).toLocaleString()),
      node('small',row.pendingOperations.length?'Original requests retained: '+row.pendingOperations.length:'Saved unfinished inputs'));
    list.append(item);
  }
}
async function saveStudy({fork=false}={}) {
  if(studyRequest) {
    const retained=structuredClone(studyRequest),current=JSON.stringify(studyDocument());
    let result;
    try{result=await request('/working/save',retained);}
    catch(error){if([409,422].includes(error.status)&&['WORKING_COPY_CONFLICT','WORKING_REQUEST_CHANGED','WORKING_SOURCE_CHANGED',
      'WORKING_ROUTE_CHANGED','WORKING_PAYMENT_SOURCE_CHANGED','TARIFF_STUDY_INVALID','TARIFF_STUDY_REQUEST_INVALID',
      'WORKING_COPY_TOO_LARGE','WORKING_COPY_SAVE_REQUIRED'].includes(error.code)) {
      studyRequest=null;persistStudyState();renderStudyStatus();
    }throw error;}
    study={workingCopyId:result.workingCopyId,revision:result.revision,label:result.label};
    studyRequest=null;studyDirty=JSON.stringify(retained.document)!==current;
    persistStudyState();await refreshStudies();renderStudyStatus();
    if(studyDirty)message('The original study save was recovered. Newer editor inputs are still available; save them as the next revision.');
    return result;
  }
  if(!source||source.version!==draft.version)throw new Error('Choose the original saved pricing source before saving this study.');
  const document=studyDocument();
  studyRequest={workingCopyId:fork||!study?crypto.randomUUID():study.workingCopyId,
    expectedRevision:fork||!study?null:study.revision,requestId:crypto.randomUUID(),
    version:draft.version,sourceBinding:{version:source.version,provenance:structuredClone(source.provenance)},document};
  persistStudyState();renderStudyStatus();
  let result;
  try{result=await request('/working/save',studyRequest);}
  catch(error) {
    // These rejections are returned before publication; the editor stays intact.
    if([409,422].includes(error.status)&&['WORKING_COPY_CONFLICT','WORKING_REQUEST_CHANGED','WORKING_SOURCE_CHANGED',
      'WORKING_ROUTE_CHANGED','WORKING_PAYMENT_SOURCE_CHANGED','TARIFF_STUDY_INVALID','TARIFF_STUDY_REQUEST_INVALID',
      'WORKING_COPY_TOO_LARGE','WORKING_COPY_SAVE_REQUIRED'].includes(error.code)) {
      studyRequest=null;persistStudyState();renderStudyStatus();
    }
    throw error;
  }
  const unchanged=JSON.stringify(studyRequest.document)===JSON.stringify(studyDocument());
  study={workingCopyId:result.workingCopyId,revision:result.revision,label:result.label};
  studyRequest=null;studyDirty=!unchanged;persistStudyState();
  await refreshStudies();renderStudyStatus();
  message(result.recovered?'Original tariff study save recovered.':'Tariff study saved with its raw inputs and original source.');
  return result;
}
function persistStudyState() {
  if(!studyReady||restoringStudy)return;
  try{localStorage.setItem(studyStorage,JSON.stringify({document:studyDocument(),study,studyRequest,studyImportRequest}));
    $('study-local-status').textContent='Browser recovery saved for this workspace.';}
  catch{$('study-local-status').textContent='Browser recovery unavailable. The editor is intact; save natively or download raw inputs.';}
}
async function saveBeforeSwitch() {
  if(studyRequest)await saveStudy();
  if(source&&(studyDirty||!study))await saveStudy();
}
async function retainBeforeNative() {
  if(studyRequest)await saveStudy();
  await saveStudy();
  if(studyRequest||studyDirty)throw new Error('Recover the original study save before sending the retained operation.');
}
async function retainAfterNative() {
  studyDirty=true;persistStudyState();
  await saveStudy();
}
async function restorePaymentEditor() {
  if(!paymentDraft.version)return;
  const original=structuredClone(paymentDraft);
  ensureSourceOption($('repricing-version'),original.version,'Retained payment source');
  await loadPrices();
  for(const row of original.valuations) {
    const card=[...$('valuation-rows').querySelectorAll('.valuation')].find(card=>card.dataset.routeId===row.routeId&&Number(card.dataset.paymentIndex)===row.paymentIndex);
    if(!card||card.dataset.expectedAmount!==row.expectedAmount)
      throw new Error('A saved payment valuation no longer matches its original option.');
    card.querySelector('.enabled').checked=row.enabled;card.querySelector('.atomic-units').value=row.atomicUnits;
    card.querySelector('.valuation-usd').value=row.usd;card.querySelector('.valuation-basis').value=row.basis;
  }
  paymentDraft=original;
}
async function applyStudy(loaded) {
  const d=structuredClone(loaded.record.document);
  // Resolve the complete original source before replacing the current editor.
  const original=await request('/source?version='+encodeURIComponent(loaded.record.source.version));
  restoringStudy=true;
  try {
    study={workingCopyId:loaded.workingCopyId,revision:loaded.revision,label:loaded.label};
    studyRequest=null;localPlanId=d.activePlanId;draft=d.draft;pendingSave=d.pendingSave;pendingCommit=d.pendingCommit;priceSaveRequest=d.priceSaveRequest;
    paymentDraft=d.repricing;source=original;activePlan=null;activePreview=null;selection=null;priceSource=null;
    priceInput=null;pricePreview=null;priceDecision=null;
    $('study-label').value=d.label;$('plan-label').value=draft.label;$('volumes').value=draft.volumes;
    ensureSourceOption($('source-version'),draft.version,original.label+' (study source)');
    $('source-summary').textContent=original.label+' / '+original.routes.length+' selected routes';
    resetPreview();renderEditors();$('calculate').disabled=false;
    $('valuation-rows').replaceChildren();$('price-preview').replaceChildren();$('price-downloads').replaceChildren();
    $('preview-prices').disabled=true;$('save-prices').disabled=true;$('stage-prices').disabled=true;
    if(d.activePlanId) {
      const plan=await request('/plans/'+encodeURIComponent(d.activePlanId));
      if(plan.version!==draft.version)throw new Error('The retained completed plan has another tariff source.');
      activePlan=plan;localPlanId=null;renderComparison(plan.review);
      $('download-plan').disabled=false;$('download-csv').disabled=false;$('print-plan').disabled=false;
    }
    await restorePaymentEditor();renderOperations();
    const history=$('study-history');history.replaceChildren();
    for(const row of loaded.history)history.append(button(new Date(row.savedAt).toLocaleString()+' / '+row.revision.slice(0,12),
      ()=>openStudy({workingCopyId:row.workingCopyId,revision:row.revision}),'small'));
    studyDirty=false;
  } finally {restoringStudy=false;persistStudyState();renderStudyStatus();}
}
async function openStudy(input) {
  await saveBeforeSwitch();
  const loaded=await request('/working/load',input);await applyStudy(loaded);
  message('Tariff study opened. Its original inputs and retained requests are available.');
}
async function newStudy(nextSource=source) {
  await saveBeforeSwitch();
  source=nextSource;localPlanId=null;
  study=null;studyRequest=null;pendingSave=null;pendingCommit=null;priceSaveRequest=null;
  paymentDraft={version:null,valuations:[]};priceSource=null;priceInput=null;pricePreview=null;priceDecision=null;
  draft={version:source?.version??'',label:'Monthly tariff comparison',volumes:'0, 100, 1000, 10000',tariffs:[]};
  $('study-label').value='Tariff study';$('plan-label').value=draft.label;$('volumes').value=draft.volumes;
  $('valuation-rows').replaceChildren();$('price-preview').replaceChildren();$('price-downloads').replaceChildren();$('study-history').replaceChildren();
  $('preview-prices').disabled=true;$('save-prices').disabled=true;$('stage-prices').disabled=true;
  if(source)draft.tariffs.push(newTariff());
  ensureSourceOption($('source-version'),draft.version,source?.label);
  $('source-summary').textContent=source?source.label+' / '+source.routes.length+' selected routes':'';
  $('calculate').disabled=!source;
  resetPreview();renderEditors();renderOperations();persist();
  message('New tariff study. The previous work remains saved in its original study.');
}
async function changeStudySource() {
  const selected=$('source-version').value;
  ensureSourceOption($('source-version'),draft.version,source?.label);
  const target=selected?await request('/source?version='+encodeURIComponent(selected)):null;
  await newStudy(target);
}

async function recoverStudyImport() {
  if(!studyImportRequest)return;
  let imported;
  try{imported=await request('/working/import',studyImportRequest);}
  catch(error) {
    if([409,422].includes(error.status)&&['WORKING_PACKAGE_CHANGED','WORKING_IMPORT_ID_REQUIRED','WORKING_SOURCE_CHANGED',
      'WORKING_ROUTE_CHANGED','WORKING_PAYMENT_SOURCE_CHANGED','TARIFF_STUDY_INVALID','TARIFF_STUDY_REQUEST_INVALID',
      'WORKING_COPY_INVALID','WORKING_COPY_TOO_LARGE','WORKING_COPY_CONFLICT','WORKING_REQUEST_CHANGED'].includes(error.code)) {
      studyImportRequest=null;persistStudyState();renderStudyStatus();
    }
    throw error;
  }
  studyImportRequest=null;persistStudyState();await refreshStudies();renderStudyStatus();
  message('Study received under a new local identity. Open it from the named studies list; the current editor is retained.');
  return imported;
}
async function receiveStudyFile() {
  const file=$('study-import').files?.[0];if(!file)return;
  try {
    if(studyImportRequest)throw new Error('Recover the original study import before receiving another file.');
    if(file.size>8*1024*1024)throw new Error('Use a complete study file up to 8 MiB.');
    const packet=JSON.parse(await file.text());
    await saveBeforeSwitch();
    studyImportRequest={package:packet,workingCopyId:crypto.randomUUID(),requestId:crypto.randomUUID()};
    persistStudyState();renderStudyStatus();
    await recoverStudyImport();
  }finally{$('study-import').value='';}
}
async function adoptLegacyStudy() {
  let value;try{value=JSON.parse(localStorage.getItem(legacyStudyKey)??'null');}catch{}
  if(!value?.draft?.version)throw new Error('The earlier browser draft has no saved pricing source.');
  const original=await request('/source?version='+encodeURIComponent(value.draft.version));
  await saveBeforeSwitch();
  study=null;studyRequest=null;source=original;draft=value.draft;
  pendingSave=value.pendingSave??null;pendingCommit=value.pendingCommit??null;priceSaveRequest=value.priceSaveRequest??null;
  paymentDraft={version:priceSaveRequest?.version??null,valuations:[]};priceSource=null;activePlan=null;activePreview=null;selection=null;
  $('study-label').value='Recovered browser tariff work';$('plan-label').value=draft.label;$('volumes').value=draft.volumes;
  ensureSourceOption($('source-version'),draft.version,original.label);renderEditors();resetPreview();renderOperations();
  await saveStudy();message('Earlier browser work saved as a native study against its exact original source.');
}

$('plan-label').value=draft.label;$('volumes').value=draft.volumes;
$('plan-label').addEventListener('input',()=>{draft.label=$('plan-label').value;persist();});
$('volumes').addEventListener('input',()=>{draft.volumes=$('volumes').value;resetPreview();});
$('source-version').addEventListener('change',()=>run(changeStudySource));
$('repricing-version').addEventListener('change',()=>{priceSource=null;invalidatePrices();$('preview-prices').disabled=true;});
$('refresh').addEventListener('click',()=>run(async()=>{await reload();message('Pricing source and saved operations refreshed.');}));
$('add-tariff').addEventListener('click',()=>run(async()=>{draft.tariffs.push(newTariff());resetPreview();renderEditors();}));
$('calculate').addEventListener('click',()=>run(calculate));
$('save-plan').addEventListener('click',()=>run(savePlan));
$('resume-save').addEventListener('click',()=>run(()=>saveBody(pendingSave)));
$('commit-selection').addEventListener('click',()=>run(commitSelection));
$('download-selection').addEventListener('click',()=>{if(selection)localDownload('tariff-selection.json',pretty(selection)+'\n');});
$('download-plan').addEventListener('click',()=>run(()=>serverDownload('/plans/'+activePlan.planId+'/files/plan.json','tariff-plan.json')));
$('download-csv').addEventListener('click',()=>run(()=>serverDownload('/plans/'+activePlan.planId+'/files/comparison.csv','tariff-comparison.csv')));
$('print-plan').addEventListener('click',()=>window.print());
$('load-prices').addEventListener('click',()=>run(loadPrices));
$('preview-prices').addEventListener('click',()=>run(previewPrices));
$('save-prices').addEventListener('click',()=>run(savePrices));
$('stage-prices').addEventListener('click',()=>run(stagePrices));
$('export-portfolio').addEventListener('click',()=>run(async()=>{
  const value=await request('/bundle');localDownload('tariff-portfolio.json',pretty(value)+'\n');
  $('portfolio-result').textContent='Exported '+value.plans.length+' complete tariff plans and their retained selections.';
}));
$('import-portfolio').addEventListener('change',()=>run(async()=>{
  const file=$('import-portfolio').files?.[0];if(!file)return;
  if(file.size>64*1024*1024)throw new Error('The complete portfolio must be at most 64 MiB.');
  const bundle=JSON.parse(await file.text()), result=await request('/receive',bundle);
  $('portfolio-result').textContent='Received '+result.plans.length+' tariff plans. Original pricing sources were matched.';
  await reload(false);message('Tariff portfolio received. Open a saved plan to continue.');
}));
$('study-label').addEventListener('input',persist);
$('study-save').addEventListener('click',()=>run(()=>saveStudy()));
$('study-fork').addEventListener('click',()=>run(()=>saveStudy({fork:true})));
$('study-recover').addEventListener('click',()=>run(()=>saveStudy()));
$('study-recover-import').addEventListener('click',()=>run(recoverStudyImport));
$('study-new').addEventListener('click',()=>run(newStudy));
$('study-legacy').addEventListener('click',()=>run(adoptLegacyStudy));
$('study-import').addEventListener('change',()=>run(receiveStudyFile));
$('study-raw').addEventListener('click',()=>run(async()=>{
  if(!source)throw new Error('Choose the original source before exporting unfinished inputs.');
  localDownload('tariff-study-inputs.json',pretty({schema:'stellar-forge.merchant-tariff-working-inputs.v1',
    source:{version:source.version,provenance:source.provenance},document:studyDocument()})+'\n');
}));
$('study-export').addEventListener('click',()=>run(async()=>{
  if(!study)throw new Error('Save a study first.');
  const packet=await request('/working/export',{workingCopyId:study.workingCopyId,revision:study.revision});
  localDownload('tariff-study.json',pretty(packet)+'\n');
  message('Exported the selected saved study revision. Raw editor changes remain available separately.');
}));
await run(async()=>{
  try {
    await reload();restoringStudy=true;
    try {
      if(localPlanId) {
        const plan=await request('/plans/'+encodeURIComponent(localPlanId));
        if(plan.version!==draft.version)throw new Error('The retained completed plan has another tariff source.');
        activePlan=plan;localPlanId=null;renderComparison(plan.review);
        $('download-plan').disabled=false;$('download-csv').disabled=false;$('print-plan').disabled=false;
        $('saved-plan-status').textContent='Retained completed plan: '+plan.label+'. The raw editor may contain newer unfinished inputs.';
      }
      await restorePaymentEditor();
    }finally{restoringStudy=false;}
    persistStudyState();renderStudyStatus();
    message('Merchant tariffs ready. Named studies retain original sources and unfinished inputs.');
  }finally{bootStudyRestore=false;}
});
