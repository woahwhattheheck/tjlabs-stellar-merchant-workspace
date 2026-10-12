/* MIT. Saved publisher refresh, original portfolio review and complete receiving. */
'use strict';
window.IatiRefreshUi=function(api){
 const $=id=>document.getElementById(id),base='/api/iati/refresh/';
 const {get,post,request,action,status,download,metrics,table,properties,details}=api;
 const routes=new Set(['plan-save','start','review','promote','cancel','abandon','resume']);
 const hash=/^[a-f0-9]{64}$/,copy=value=>JSON.parse(JSON.stringify(value));
 const short=value=>String(value??'').slice(0,12);
 const label=value=>String(value).replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/[_-]/g,' ').replace(/^./,s=>s.toUpperCase());
 const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
 const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
 const query=value=>new URLSearchParams(Object.entries(value).filter(([,v])=>v!==undefined&&v!==null).map(([k,v])=>[k,String(v)])).toString();
 let context=null,db=null,plans=[],plan=null,planStatus=null,runs=[],run=null,latestPlanRevision=0,latestRunRevision=0;
 let editing=false,createBaseline=null,preview=null,previewInput=null,pending=null,serverRequest=null,currentTab='plan';
 let planListSnapshot=null,runsSnapshot=null,historySnapshot=null;
 const selectedSources=()=>api.workspaceState()?.sources??[];
 const sourceLabel=id=>{const s=selectedSources().find(v=>v.id===id);return(s?.label||s?.name||'Retained XML')+' · '+short(id);};
 function empty(holder,text){holder.replaceChildren();holder.classList.add('empty');holder.textContent=text;}
 function clean(holder){holder.replaceChildren();holder.classList.remove('empty');}
 function note(holder,text,kind='rf-warning'){const p=document.createElement('p');p.className=kind;p.textContent=text;holder.append(p);}
 function who(){const value=$('rf-actor').value.trim();if(!value)throw new Error('Enter the named operator for this saved action.');return value;}
 function required(id,message){const value=$(id).value.trim();if(!value)throw new Error(message);return value;}
 function revision(id){const value=$(id).value.trim();if(!value)return undefined;const n=Number(value);if(!Number.isSafeInteger(n)||n<1)throw new Error('Choose a positive whole saved revision.');return n;}
 function choose(id,items,selected){const el=$(id),before=selected??el.value;el.replaceChildren(new Option(items.length?'Choose a retained record':'No retained records',''));for(const item of items)el.add(new Option(item.label,item.id));el.value=items.some(v=>v.id===before)?before:'';}
 function tab(value){currentTab=value;document.querySelectorAll('[data-rf-panel]').forEach(el=>el.hidden=el.dataset.rfPanel!==value);document.querySelectorAll('[data-rf-tab]').forEach(el=>el.setAttribute('aria-selected',String(el.dataset.rfTab===value)));}
 function busy(){return api.isBusy?.()??false;}
 function latestPlan(){return !!plan&&plan.revision===latestPlanRevision;}
 function latestRun(){return !!run&&run.revision===latestRunRevision&&run.planId===plan?.id;}
 function hasPending(){return !!pending||serverRequest?.state==='PREPARED';}
 function requirePlan(active=false){if(!latestPlan())throw new Error('Open the current saved plan before changing it.');if(active&&plan.state!=='ACTIVE')throw new Error('Make this plan active before starting a refresh.');return plan;}
 function requireRun(){requirePlan();if(!latestRun())throw new Error('Open the current saved run before changing its review.');return run;}
 function requestId(){if(!crypto.randomUUID)throw new Error('Open this local workspace in a browser with secure UUID support.');return crypto.randomUUID();}
 async function checkedContext(){
  const value=await get(base+'context');
  if(!hash.test(value.workspaceSha256??''))throw new Error('The original refresh workspace identity is incomplete.');
  if(context&&context.workspaceSha256!==value.workspaceSha256)throw new Error('This address now serves another workspace. Refresh saved plans to open its own retained actions.');
  return value;
 }
 async function database(){
  if(db)return db;
  db=await new Promise((resolve,reject)=>{const r=indexedDB.open('sf30-iati-refresh-actions',1);r.onupgradeneeded=()=>r.result.createObjectStore('actions',{keyPath:'key'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||new Error('The browser could not retain the complete original action.'));});
  return db;
 }
 async function stored(mode,value,expectedId){
  if(!context)throw new Error('Open the original refresh workspace first.');
  const databaseHandle=await database(),key=context.workspaceSha256+':pending';
  return new Promise((resolve,reject)=>{
   const tx=databaseHandle.transaction('actions',mode==='read'?'readonly':'readwrite'),store=tx.objectStore('actions');
   let result=null,issue=null;const reading=store.get(key);
   reading.onsuccess=()=>{
    const previous=reading.result??null;
    try{
     if(mode==='read'){result=previous;return;}
     if(mode==='prepare'){
      if(previous&&previous.input.requestId!==expectedId)throw new Error('Another complete refresh action is already saved in this workspace. Read and continue that original action first.');
      const next={...copy(value),key};
      if(previous)next.previousPending=copy(previous);
      store.put(next);result=next;return;
     }
     if(mode==='observe'){
      if(previous?.input.requestId===value.input.requestId){store.put({...copy(value),key});result=value;}else result=previous;
      return;
     }
     if(mode==='finish'){
      store.put({...copy(value),key:context.workspaceSha256+':history:'+value.input.requestId});
      if(previous?.input.requestId===value.input.requestId)store.delete(key);
      result=previous?.input.requestId===value.input.requestId?null:previous;return;
     }
     if(mode==='revise'){
      if(previous?.input.requestId!==value.input.requestId)throw new Error('The retained browser action changed. Refresh it before revising the input.');
      store.put({...copy(value),key:context.workspaceSha256+':history:'+value.input.requestId});
      if(previous.previousPending){store.put({...previous.previousPending,key});result=previous.previousPending;}else{store.delete(key);result=null;}
     }
    }catch(error){issue=error;tx.abort();}
   };
   tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(issue||tx.error||new Error('The original action could not be retained completely.'));
  });
 }
 function validateIntent(value){
  if(!value||!routes.has(value.route)||!value.input||typeof value.input.requestId!=='string'||value.workspaceSha256!==context.workspaceSha256)throw new Error('The retained action belongs to a different workspace or workflow.');
  if(value.route==='resume'&&value.originalRequest?.requestId!==value.input.requestId)throw new Error('Receive the complete original request before continuing it.');
  return value;
 }
 async function pages(route,params={}){
  const all=[];let offset=0,snapshot,total;
  for(;;){
   const page=await get(base+route+'?'+query({...params,offset,limit:250,snapshot}));
   if(!Array.isArray(page.items)||page.offset!==offset||typeof page.snapshot!=='string'||!Number.isSafeInteger(page.total)||page.total<0)throw new Error('The saved history page is incomplete.');
   if(snapshot!==undefined&&(page.snapshot!==snapshot||page.total!==total))throw new Error('The selected history snapshot changed. Read it again from its first page.');
   snapshot=page.snapshot;total=page.total;all.push(...page.items);
   if(page.nextOffset===null){if(all.length!==total)throw new Error('The complete saved history has not been received.');return{items:all,snapshot,total};}
   if(!Number.isSafeInteger(page.nextOffset)||page.nextOffset!==offset+page.items.length||page.nextOffset<=offset||page.nextOffset>=total)throw new Error('The saved history returned an invalid continuation.');
   offset=page.nextOffset;
  }
 }
 function pointer(holder,title,value){
  if(!value)return;
  const h=document.createElement('h3');h.textContent=title;holder.append(h);
  properties(holder,{portfolio:value.id,revision:value.revision,review:value.review?.status,reviewer:value.review?.reviewer||'Not yet named',publisherSources:value.sources?.length??0});
  details(holder,'Complete retained '+title.toLowerCase(),value);
 }
 function renderPending(){
  const current=pending??(serverRequest?.state==='PREPARED'?{route:serverRequest.kind,input:serverRequest.input}:null);
  $('rf-pending').hidden=!current;
  if(!current)return;
  const id=pending?.input.requestId??serverRequest.requestId;
  $('rf-pending-text').textContent='Saved '+label(current.route)+' action · '+id+'. Continue this original request to receive its saved outcome.';
  clean($('rf-pending-details'));
  if(pending?.observations?.length){const last=pending.observations.at(-1);note($('rf-pending-details'),last.message);}
  if(serverRequest?.state==='PREPARED'&&serverRequest.native?.portfolio)pointer($('rf-pending-details'),'Retained native portfolio',serverRequest.native.portfolio);
  details($('rf-pending-details'),'Complete original action',serverRequest??pending);
  $('rf-revise').hidden=!(pending?.definiteRejection&&pending?.notRecorded);
  $('rf-abandon-box').hidden=!(serverRequest?.state==='PREPARED'&&serverRequest.native===null&&plan&&serverRequest.input.planId===plan.id);
 }
 function buttons(){
  const working=busy(),locked=hasPending(),current=latestPlan(),currentRun=latestRun();
  for(const el of document.querySelectorAll('[data-rf-edit]'))el.disabled=working||locked;
  for(const el of document.querySelectorAll('#rf-pairs select,#rf-additions input'))el.disabled=working||locked||!current||plan?.state!=='ACTIVE';
  $('rf-plan-open').disabled=working||!$('rf-plan-select').value;
  $('rf-plan-new').disabled=working||locked;
  $('rf-load-baseline').disabled=working||locked||editing||!$('rf-create-portfolio').value;
  $('rf-review-baseline').disabled=working||!createBaseline;
  $('rf-plan-save').disabled=working||locked||(editing?!current:!createBaseline||createBaseline.review?.status!=='reviewed');
  $('rf-preview').disabled=working||locked||!current||plan?.state!=='ACTIVE';
  $('rf-start').disabled=working||locked||!current||plan?.state!=='ACTIVE'||!preview;
  for(const id of ['rf-baseline-open','rf-current-open','rf-runs-reload','rf-history-load','rf-export'])$(id).disabled=working||!plan;
  $('rf-current-open').disabled=working||!planStatus?.portfolio;
  $('rf-run-open').disabled=working||!plan||!$('rf-run-select').value;
  $('rf-run-history').disabled=working||!run;
  $('rf-run-baseline-open').disabled=working||!run?.baseline;
  $('rf-run-candidate-open').disabled=working||!run?.candidate;
  const currentCandidate=run?.candidate&&planStatus?.portfolio&&same(run.candidate,planStatus.portfolio);
  $('rf-review-save').disabled=working||locked||!current||!currentRun||!currentCandidate||!['AWAITING_REVIEW','REVIEWED','NEEDS_CORRECTION'].includes(run?.state);
  $('rf-promote').disabled=working||locked||!current||!currentRun||run?.state!=='REVIEWED';
  $('rf-cancel').disabled=working||locked||!current||!currentRun||['PROMOTED','CANCELLED'].includes(run?.state);
  $('rf-reconcile').disabled=$('rf-resume').disabled=working||!locked;
  $('rf-revise').disabled=working||!(pending?.definiteRejection&&pending?.notRecorded);
  $('rf-abandon').disabled=working||serverRequest?.state!=='PREPARED'||serverRequest?.native!==null||!plan||serverRequest?.input.planId!==plan.id;
  $('rf-change-selection').disabled=working||locked||!current;
  for(const el of $('rf-selection-fields').querySelectorAll('input,textarea'))el.disabled=working||locked||!$('rf-change-selection').checked;
  $('rf-reload').disabled=working;
  renderPending();
 }
 function clearPreview(){preview=null;previewInput=null;clean($('rf-preview-result'));$('rf-start-context').textContent='Preview the selection before creating its native portfolio edition.';buttons();}
 function fillSelection(value={}){
  for(const[id,key]of [['rf-activity-ids','activityIds'],['rf-currencies','currencies'],['rf-transaction-types','transactionTypes'],['rf-budget-types','budgetTypes']])$(id).value=(value[key]??[]).join('\n');
  $('rf-date-from').value=value.dateFrom??'';$('rf-date-to').value=value.dateTo??'';
 }
 function selectionInput(){
  if(!$('rf-change-selection').checked)return undefined;
  const value={};for(const[id,key]of [['rf-activity-ids','activityIds'],['rf-currencies','currencies'],['rf-transaction-types','transactionTypes'],['rf-budget-types','budgetTypes']]){const items=$(id).value.split(/\r?\n/).map(v=>v.trim()).filter(Boolean);if(items.length)value[key]=items;}
  if($('rf-date-from').value)value.dateFrom=$('rf-date-from').value;if($('rf-date-to').value)value.dateTo=$('rf-date-to').value;
  return value;
 }
 function renderSources(preserve=false){
  const previous=new Map(preserve?[...$('rf-pairs').querySelectorAll('select')].map(el=>[el.dataset.before,el.value]):[]);
  const additions=new Set(preserve?[...$('rf-additions').querySelectorAll('input:checked')].map(el=>el.value):[]);
  clean($('rf-pairs'));clean($('rf-additions'));clean($('rf-selection-baseline'));
  if(!plan){empty($('rf-pairs'),'Open an active plan to prepare its next edition.');return;}
  for(const id of plan.baseline.sources){
   const row=document.createElement('div');row.className='rf-source-pair';
   const source=document.createElement('div');source.className='rf-source-label';
   const strong=document.createElement('strong');strong.textContent=sourceLabel(id);const small=document.createElement('small');small.textContent=id;source.append(strong,small);
   const labelEl=document.createElement('label');labelEl.textContent='Next retained publisher edition';
   const select=document.createElement('select');select.dataset.before=id;select.add(new Option('Remove this publisher source',''));
   select.add(new Option('Keep the same original edition',id));for(const item of selectedSources())if(item.id!==id)select.add(new Option(sourceLabel(item.id),item.id));
   const chosen=previous.has(id)?previous.get(id):id;select.value=[...select.options].some(v=>v.value===chosen)?chosen:id;
   select.addEventListener('change',clearPreview);labelEl.append(select);row.append(source,labelEl);$('rf-pairs').append(row);
  }
  for(const item of selectedSources().filter(value=>!plan.baseline.sources.includes(value.id))){
   const row=document.createElement('label');row.className='source-choice';const input=document.createElement('input');input.type='checkbox';input.value=item.id;input.checked=additions.has(item.id);input.addEventListener('change',clearPreview);
   const text=document.createElement('span');text.textContent=item.label||item.name||'Retained XML';const small=document.createElement('small');small.textContent=item.id+' · '+item.bytes+' original bytes';text.append(small);row.append(input,text);$('rf-additions').append(row);
  }
  if(!$('rf-additions').childElementCount)empty($('rf-additions'),'Retain a later publisher edition to add a source or select a replacement.');
  properties($('rf-selection-baseline'),Object.keys(plan.baseline.selection).length?plan.baseline.selection:{coverage:'All reported records in the retained sources'});
  buttons();
 }
 function prepareInput(){
  requirePlan(true);if(!planStatus?.portfolio)throw new Error('Read the current native portfolio before preparing a refresh.');
  const sources=[],pairs=[],targets=new Set();
  for(const el of $('rf-pairs').querySelectorAll('select')){
   if(!el.value)continue;if(targets.has(el.value))throw new Error('Each original publisher needs its own selected replacement. A source is paired only once.');
   targets.add(el.value);sources.push(el.value);if(el.value!==el.dataset.before)pairs.push({before:el.dataset.before,after:el.value});
  }
  for(const el of $('rf-additions').querySelectorAll('input:checked'))if(!sources.includes(el.value))sources.push(el.value);
  if(!sources.length)throw new Error('Select at least one retained publisher source.');
  const value={planId:plan.id,expectedPlanRevision:plan.revision,expectedPortfolioRevision:planStatus.portfolio.revision,sources,pairs};
  const selection=selectionInput();if(selection!==undefined)value.selection=selection;
  const selectionNote=$('rf-selection-note').value.trim(),sourceChangeNote=$('rf-source-note').value.trim();
  if(selectionNote)value.selectionNote=selectionNote;if(sourceChangeNote)value.sourceChangeNote=sourceChangeNote;
  return value;
 }
 function renderPlan(){
  clean($('rf-plan-summary'));clean($('rf-baseline'));
  if(!plan){empty($('rf-plan-summary'),'Create a plan from a reviewed portfolio.');empty($('rf-baseline'),'Open a saved plan to see its retained baseline.');return;}
  properties($('rf-plan-summary'),{name:plan.name,owner:plan.owner,state:plan.state,planRevision:plan.revision,currentPlanRevision:latestPlanRevision,updated:plan.updated});
  if(!latestPlan())note($('rf-plan-summary'),'This plan has a newer saved revision. Open it before making a change.');
  pointer($('rf-baseline'),'Plan baseline',plan.baseline);pointer($('rf-baseline'),'Current native portfolio',planStatus?.portfolio);
  if(planStatus?.portfolio&&planStatus.portfolio.revision!==plan.baseline.revision)note($('rf-baseline'),'The native portfolio has advanced beyond this retained baseline. Review the saved runs before choosing the next baseline.','rf-success');
  $('rf-export-context').textContent='Export the complete saved plan, its original source files, portfolio history and refresh journal.';
 }
 function formPlan(value){
  editing=!!value;$('rf-plan-title').textContent=value?'Edit the saved refresh plan':'Create a saved refresh plan';$('rf-plan-mode').textContent=value?'Saved revision '+value.revision:'New plan';
  $('rf-plan-name').value=value?.name??'';$('rf-plan-note').value=value?.note??'';$('rf-plan-state').value=value?.state??'ACTIVE';$('rf-create-baseline').hidden=editing;
  if(value&&!$('rf-actor').value)$('rf-actor').value=value.owner;
 }
 function resetPlan(){
  plan=null;planStatus=null;run=null;runs=[];editing=false;createBaseline=null;latestPlanRevision=latestRunRevision=0;serverRequest=null;historySnapshot=null;runsSnapshot=null;
  $('rf-plan-select').value='';formPlan(null);clean($('rf-create-summary'));empty($('rf-create-summary'),'Choose a saved portfolio, then inspect its named review.');
  $('rf-prepare-form').reset();$('rf-selection-fields').hidden=true;fillSelection({});renderPlan();renderSources();renderRun();clearPreview();tab('plan');
 }
 async function refresh({open=false}={}){
  const current=await get(base+'context');if(!hash.test(current.workspaceSha256??''))throw new Error('The original refresh workspace identity is incomplete.');
  if(context&&context.workspaceSha256!==current.workspaceSha256){pending=null;resetPlan();}
  context=current;pending=await stored('read');if(pending)validateIntent(pending);
  const list=await pages('plans');plans=list.items;planListSnapshot=list.snapshot;
  choose('rf-plan-select',plans.map(v=>({id:v.id,label:v.name+' · r'+v.revision+' · '+v.state})),plan?.id??pending?.input.planId);
  const native=api.portfolioList?.()??[];choose('rf-create-portfolio',native.map(v=>({id:v.id,label:v.name+' · r'+v.revision})),createBaseline?.id);
  if(plan){
   latestPlanRevision=plans.find(v=>v.id===plan.id)?.revision??0;
   const prior=planStatus;planStatus=await get(base+'status?'+query({plan:plan.id}));serverRequest=planStatus.pendingRequest;
   if(prior&&!same(prior.portfolio,planStatus.portfolio))clearPreview();
   renderPlan();renderSources(true);
  }
  if(open&&$('rf-plan-select').value)await openPlan($('rf-plan-select').value);
  buttons();
 }
 async function loadRuns(){
  if(!plan)return;const list=await pages('runs',{plan:plan.id});runs=list.items;runsSnapshot=list.snapshot;
  choose('rf-run-select',[...runs].reverse().map(v=>({id:v.id,label:v.label+' · '+v.state+' · r'+v.revision})),run?.id);
  latestRunRevision=run?runs.find(v=>v.id===run.id)?.revision??0:0;buttons();
 }
 async function openPlan(id){
  if(!id)throw new Error('Choose a saved refresh plan.');
  const saved=await get(base+'status?'+query({plan:id}));
  plan=saved.plan;planStatus=saved;latestPlanRevision=plan.revision;serverRequest=saved.pendingRequest;historySnapshot=null;
  if(run?.planId!==id)run=null;
  $('rf-plan-select').value=id;formPlan(plan);$('rf-prepare-form').reset();$('rf-selection-fields').hidden=true;fillSelection(plan.baseline.selection);
  clearPreview();renderPlan();renderSources();await loadRuns();renderRun();buttons();
 }
 async function loadBaseline(){
  const id=$('rf-create-portfolio').value;if(!id)throw new Error('Choose a saved native portfolio.');
  const value=await get('/api/iati/portfolio?'+query({id,revision:revision('rf-create-revision')}));
  createBaseline=value;clean($('rf-create-summary'));pointer($('rf-create-summary'),'Selected starting portfolio',value);
  $('rf-create-revision').value=String(value.revision);
  if(value.review?.status!=='reviewed')note($('rf-create-summary'),'Open this edition in Portfolio review and save its named review before creating the refresh plan.');
  buttons();
 }
 function countRows(before={},after={}){
  return [...new Set([...Object.keys(before),...Object.keys(after)])].map(key=>({dimension:label(key),baseline:before[key]??'—',candidate:after[key]??'—',change:Number.isSafeInteger(before[key])&&Number.isSafeInteger(after[key])?after[key]-before[key]:'—'}));
 }
 function renderPreview(value){
  clean($('rf-preview-result'));const h=document.createElement('h3');h.textContent='Complete source selection is ready';$('rf-preview-result').append(h);
  const summary=document.createElement('div');$('rf-preview-result').append(summary);metrics(summary,[['Baseline revision',value.baseline.revision],['Selected publisher files',value.sources.length],['Paired replacements',value.pairs.length]]);
  const holder=document.createElement('div');holder.className='rf-counts';$('rf-preview-result').append(holder);table(holder,[{key:'dimension',label:'Baseline coverage'},{key:'count',label:'Retained rows'}],Object.entries(value.beforeCounts).map(([key,count])=>({dimension:label(key),count})));
  const changes=document.createElement('div');$('rf-preview-result').append(changes);table(changes,[{key:'change',label:'Source change'},{key:'source',label:'Original source SHA'}],[...value.unchangedSources.map(source=>({change:'Unchanged',source})),...value.addedSources.map(source=>({change:'Added',source})),...value.removedSources.map(source=>({change:'Removed',source}))]);
  if(value.pairs.length){const box=document.createElement('div');$('rf-preview-result').append(box);table(box,[{key:'before',label:'Original publisher edition'},{key:'after',label:'Selected replacement'}],value.pairs);}
  if(value.selectionChanged)note($('rf-preview-result'),'The activity or finance selection changes. Review that change separately when comparing the resulting records.');
  if(value.selectionNote)properties($('rf-preview-result'),{selectionNote:value.selectionNote});
  if(value.sourceChangeNote)properties($('rf-preview-result'),{sourceChangeNote:value.sourceChangeNote});
  details($('rf-preview-result'),'Every retained source and the canonical selection',value);
  $('rf-start-context').textContent='Creates the candidate in portfolio '+value.portfolioId+' from current revision '+value.expectedPortfolioRevision+'. The complete native comparison and named review follow.';
 }
 function renderRun(){
  clean($('rf-run-summary'));clean($('rf-run-counts'));clean($('rf-run-comparison'));
  if(!run){empty($('rf-run-summary'),'Open a retained refresh run.');$('rf-comparison-note').textContent='Open a run to review its original source and portfolio changes.';return;}
  properties($('rf-run-summary'),{label:run.label,state:run.state,savedRunRevision:run.revision,currentRunRevision:latestRunRevision,operator:run.actor,created:run.created,updated:run.updated,note:run.note});
  if(!latestRun())note($('rf-run-summary'),'This is an earlier run revision. Open the current revision before saving review or promotion.');
  if(run.review)properties($('rf-run-summary'),{review:run.review.status,reviewer:run.review.reviewer,reviewNote:run.review.note});
  if(run.promotion)details($('rf-run-summary'),'Retained baseline promotion',run.promotion);
  if(run.cancellation)details($('rf-run-summary'),'Retained cancellation',run.cancellation);
  const changed=run.preview?.selectionChanged??run.comparison?.selectionChanged;
  $('rf-comparison-note').textContent=changed?'This run changes the activity or finance selection. The comparison retains that scope change alongside the source differences. Read the original financial groups in the complete candidate.':'Compare the retained editions within their original publisher, activity, currency, transaction type, value date and budget period.';
  table($('rf-run-counts'),[{key:'dimension',label:'Reported coverage'},{key:'baseline',label:'Baseline rows'},{key:'candidate',label:'Candidate rows'},{key:'change',label:'Row change'}],countRows(run.comparison?.beforeCounts??run.preview?.beforeCounts,run.afterCounts??run.comparison?.afterCounts));
  note($('rf-run-counts'),'These are retained row counts. The full portfolio report presents reported amounts in their original financial groups.','rf-success');
  if(run.comparison){
   for(const entry of run.comparison.comparisons){details($('rf-run-comparison'),label(entry.collection)+' · '+short(entry.before)+' → '+short(entry.after),entry.comparison);}
   details($('rf-run-comparison'),'Complete native portfolio comparison',run.comparison);
  }else empty($('rf-run-comparison'),'This run has no completed native comparison.');
  if(run.candidate&&planStatus?.portfolio&&!same(run.candidate,planStatus.portfolio))note($('rf-run-summary'),'The native portfolio has a later current revision. Open the current portfolio and refresh the saved plan before reviewing this candidate.');
  details($('rf-run-summary'),'Complete saved run',run);
  $('rf-run-revision').value=String(run.revision);buttons();
 }
 async function openRun(id,selectedRevision){
  if(!plan||!id)throw new Error('Choose a retained refresh run.');
  run=await get(base+'run?'+query({plan:plan.id,id,revision:selectedRevision}));
  latestRunRevision=runs.find(v=>v.id===id)?.revision??run.revision;$('rf-run-select').value=id;renderRun();buttons();
 }
 async function showReceipt(result,selectedPlanId){
  const planId=result.plan?.id??selectedPlanId??plan?.id;
  clean($('rf-action-receipt'));const title=document.createElement('h3');title.textContent='Received saved action';$('rf-action-receipt').append(title);
  properties($('rf-action-receipt'),{action:label(result.action),outcome:result.state,planRevision:result.plan?.revision??'Retained',runState:result.run?.state??'—'});
  details($('rf-action-receipt'),'Complete original action result',result);
  status(result.state==='ABANDONED'?'The original preparation is closed and retained.':'The original '+label(result.action)+' action completed.');
  if(api.refreshWorkspace)await api.refreshWorkspace();else await refresh();
  if(planId)await openPlan(planId);
  if(result.run){await openRun(result.run.id);tab('review');}
  else if(result.plan)tab('plan');
 }
 async function finish(result){
  if(!['COMPLETE','ABANDONED'].includes(result?.state))throw new Error('The original request returned an unfinished result. Read and continue its saved action.');
  if(pending&&result.requestId!==pending.input.requestId)throw new Error('Receive the result for the same original browser request.');
  const retained=pending,selectedPlanId=retained?.input.planId??retained?.originalRequest?.input.planId??plan?.id;
  if(retained){pending=await stored('finish',{...retained,result:copy(result),completedAt:new Date().toISOString()});}
  serverRequest=null;renderPending();await showReceipt(result,selectedPlanId);
 }
 async function perform(){
  const retained=validateIntent(pending);await checkedContext();let result;
  try{result=await post(base+retained.route,copy(retained.input));}
  catch(error){
   const observation={at:new Date().toISOString(),status:error.status??null,message:error.message,details:error.details??null};
   const updated={...retained,observations:[...(retained.observations??[]),observation],definiteRejection:Number.isInteger(error.status)&&error.status>=400&&error.status<500&&![408,429].includes(error.status),notRecorded:false};
   pending=await stored('observe',updated);renderPending();throw error;
  }
  pending=await stored('observe',{...retained,returnedResult:copy(result),returnedAt:new Date().toISOString()});
  if(result.requestId!==retained.input.requestId)throw new Error('The returned result belongs to another saved request.');
  // Receiving or repainting a completed result is outside the provider catch.
  await finish(result);
 }
 async function submit(route,input,{replacePendingId}={}){
  await checkedContext();
  const retained={route,input:copy({...input,requestId:input.requestId??requestId()}),workspaceSha256:context.workspaceSha256,createdAt:new Date().toISOString(),observations:[]};
  pending=await stored('prepare',retained,replacePendingId);serverRequest=null;renderPending();buttons();await perform();
 }
 async function reconcile(){
  await checkedContext();
  const id=pending?.input.requestId??serverRequest?.requestId;if(!id)throw new Error('There is no selected original request.');
  const record=await get(base+'request?'+query({requestId:id}));
  if(record.requestId!==id)throw new Error('The received action belongs to another request.');
  serverRequest=record;
  if(record.state==='COMPLETE'){await finish(record.result);return record;}
  if(record.state==='ABANDONED'){await finish({requestId:id,action:record.kind,state:'ABANDONED',cancellation:record.cancellation});return record;}
  if(record.state==='NOT_RECORDED'){
   if(pending){pending=await stored('observe',{...pending,notRecorded:true,notRecordedAt:new Date().toISOString()});}
   status('The server has no saved action under this request ID. Its complete original browser input is retained for the next attempt.');
  }else if(record.state==='PREPARED')status('The complete original preparation is received. Continue that same request to finish its retained native operation.');
  else throw new Error('The saved request returned an unsupported state: '+record.state);
  renderPending();buttons();return record;
 }
 async function resume(){
  const record=await reconcile();if(['COMPLETE','ABANDONED'].includes(record.state))return;
  if(record.state==='NOT_RECORDED'){if(!pending)throw new Error('Receive the complete original input before retrying it.');return perform();}
  if(!pending){
   pending=await stored('prepare',{route:'resume',input:{requestId:record.requestId},originalRequest:copy(record),workspaceSha256:context.workspaceSha256,createdAt:new Date().toISOString(),observations:[]});
  }
  validateIntent(pending);
  const result=await post(base+'resume',{requestId:record.requestId});
  if(result.requestId!==record.requestId)throw new Error('The continuation belongs to another saved request.');
  await finish(result);
 }
 async function openNative(value){if(!value)throw new Error('Choose a retained portfolio edition.');await api.openPortfolio(value.id,value.revision);api.show('portfolios');}
 document.querySelectorAll('[data-rf-tab]').forEach(el=>el.addEventListener('click',()=>tab(el.dataset.rfTab)));
 $('rf-open-view').addEventListener('click',()=>action('Opening saved publisher refresh work…',()=>refresh({open:!plan})));
 $('rf-reload').onclick=()=>action('Refreshing saved publisher plans…',()=>refresh());
 $('rf-plan-select').onchange=buttons;$('rf-run-select').onchange=()=>{$('rf-run-revision').value='';buttons();};
 $('rf-plan-open').onclick=()=>action('Opening the original refresh plan…',()=>openPlan($('rf-plan-select').value));
 $('rf-plan-new').onclick=()=>action('Preparing a new refresh plan…',async()=>{resetPlan();});
 $('rf-create-portfolio').onchange=()=>{createBaseline=null;$('rf-create-revision').value='';empty($('rf-create-summary'),'Inspect the selected portfolio before using it as the baseline.');buttons();};
 $('rf-create-revision').oninput=()=>{createBaseline=null;buttons();};
 $('rf-load-baseline').onclick=()=>action('Reading the complete selected baseline…',loadBaseline);
 $('rf-review-baseline').onclick=()=>action('Opening the original portfolio review…',()=>openNative(createBaseline));
 $('rf-baseline-open').onclick=()=>action('Opening the retained plan baseline…',()=>openNative(plan?.baseline));
 $('rf-current-open').onclick=()=>action('Opening the current native portfolio…',()=>openNative(planStatus?.portfolio));
 $('rf-plan-form').onsubmit=event=>{event.preventDefault();action('Saving the complete refresh plan…',async()=>{
  const input={name:required('rf-plan-name','Enter a name for the plan.'),owner:who(),note:$('rf-plan-note').value.trim(),state:$('rf-plan-state').value};
  if(editing){requirePlan();Object.assign(input,{id:plan.id,expectedRevision:plan.revision});}
  else{if(!createBaseline||createBaseline.review?.status!=='reviewed')throw new Error('Inspect an already reviewed native portfolio baseline.');Object.assign(input,{portfolioId:createBaseline.id,baselineRevision:createBaseline.revision});}
  await submit('plan-save',input);
 });};
 for(const id of ['rf-source-note','rf-selection-note','rf-activity-ids','rf-currencies','rf-transaction-types','rf-budget-types','rf-date-from','rf-date-to'])$(id).addEventListener('input',clearPreview);
 $('rf-change-selection').onchange=()=>{$('rf-selection-fields').hidden=!$('rf-change-selection').checked;clearPreview();};
 $('rf-prepare-form').onsubmit=event=>{event.preventDefault();action('Previewing the complete publisher selection…',async()=>{
  await checkedContext();const input=prepareInput(),result=await post(base+'preview',input);
  if(!hash.test(result.sha256??'')||result.planId!==plan.id||result.planRevision!==plan.revision||result.expectedPortfolioRevision!==input.expectedPortfolioRevision)throw new Error('The preview does not match the selected plan and portfolio revisions.');
  preview=copy(result);previewInput=copy(input);renderPreview(preview);buttons();status('The complete source selection is ready for its original native portfolio operation.');
 });};
 $('rf-start').onclick=()=>action('Creating the original candidate and comparison…',async()=>{
  if(!preview||!same(prepareInput(),previewInput))throw new Error('Preview the current source selection before creating its candidate.');
  const input={...copy(previewInput),sources:copy(preview.sources),pairs:copy(preview.pairs),previewSha256:preview.sha256,label:required('rf-run-label','Enter a label for this publisher refresh.'),actor:who(),note:$('rf-run-note').value.trim()};
  if(preview.selectionChanged||previewInput.selection!==undefined)input.selection=copy(preview.selection);
  if(preview.selectionNote)input.selectionNote=preview.selectionNote;if(preview.sourceChangeNote)input.sourceChangeNote=preview.sourceChangeNote;
  await submit('start',input);
 });
 $('rf-runs-reload').onclick=()=>action('Reading current retained refresh runs…',async()=>{if(plan)await openPlan(plan.id);});
 $('rf-run-open').onclick=()=>action('Opening the complete saved refresh run…',()=>openRun($('rf-run-select').value,revision('rf-run-revision')));
 $('rf-run-baseline-open').onclick=()=>action('Opening this run’s original baseline…',()=>openNative(run?.baseline));
 $('rf-run-candidate-open').onclick=()=>action('Opening the complete candidate for review…',()=>openNative(run?.candidate));
 $('rf-review-form').onsubmit=event=>{event.preventDefault();action('Saving the named candidate review…',async()=>{requireRun();if(!planStatus?.portfolio)throw new Error('Read the current native portfolio first.');await submit('review',{planId:plan.id,runId:run.id,expectedRevision:run.revision,expectedPortfolioRevision:planStatus.portfolio.revision,review:{status:$('rf-review-status').value,reviewer:who(),note:required('rf-review-note','Describe the review decision.')}});});};
 $('rf-promote-form').onsubmit=event=>{event.preventDefault();action('Promoting the exact reviewed baseline…',async()=>{requireRun();await submit('promote',{planId:plan.id,runId:run.id,expectedRevision:run.revision,expectedPlanRevision:plan.revision,actor:who(),note:required('rf-promote-note','Describe why this reviewed candidate becomes the baseline.')});});};
 $('rf-cancel-form').onsubmit=event=>{event.preventDefault();action('Closing the selected original refresh run…',async()=>{requireRun();await submit('cancel',{planId:plan.id,runId:run.id,expectedRevision:run.revision,actor:who(),note:required('rf-cancel-note','Describe why this run is being closed.')});});};
 $('rf-reconcile').onclick=()=>action('Reading the original saved request…',reconcile);
 $('rf-resume').onclick=()=>action('Continuing the exact original request…',resume);
 $('rf-revise').onclick=()=>action('Retaining the rejected input for revision…',async()=>{
  const record=await reconcile();if(record.state!=='NOT_RECORDED'||!pending?.definiteRejection)throw new Error('Read the original saved action before changing the input.');
  pending=await stored('revise',{...pending,revisedAt:new Date().toISOString()});serverRequest=null;renderPending();buttons();status('The rejected input is retained in browser history. Correct the fields and save the revised request.');
 });
 $('rf-abandon').onclick=()=>action('Closing the original preparation through its native request record…',async()=>{
  const record=await reconcile();if(record.state!=='PREPARED'||record.native!==null||!plan||record.input.planId!==plan.id)throw new Error('Open this preparation’s original plan and continue its native operation before choosing the outcome.');
  await submit('abandon',{planId:plan.id,pendingRequestId:record.requestId,actor:who(),note:required('rf-abandon-note','Describe why this original preparation should be closed.')},{replacePendingId:pending?.input.requestId});
 });
 $('rf-run-history').onclick=()=>action('Receiving complete original run history…',async()=>{
  if(!plan||!run)throw new Error('Open a retained refresh run.');const history=await pages('run-history',{plan:plan.id,id:run.id});
  table($('rf-run-history-result'),['revision','state','actor','updated','note'],history.items);details($('rf-run-history-result'),'Every saved run revision',history);
 });
 $('rf-history-load').onclick=()=>action('Receiving the complete plan and run histories…',async()=>{
  if(!plan)throw new Error('Open a saved refresh plan.');
  const [history,runList]=await Promise.all([pages('history',{plan:plan.id}),pages('runs',{plan:plan.id})]);historySnapshot=history.snapshot;
  table($('rf-history'),[{key:'revision',label:'Plan revision'},'name','owner','state',{key:'baselineRevision',label:'Baseline revision'},'updated','note'],history.items.map(v=>({...v,baselineRevision:v.baseline?.revision})));
  table($('rf-history-runs'),['label','state','revision','actor','created','updated','note'],runList.items);
  clean($('rf-history-detail'));details($('rf-history-detail'),'Every original plan revision',history);details($('rf-history-detail'),'Every retained refresh run',runList);
 });
 $('rf-export').onclick=()=>action('Preparing the complete original refresh workspace…',async()=>{
  if(!plan)throw new Error('Open a saved refresh plan.');await checkedContext();
  const current=await get(base+'status?'+query({plan:plan.id}));await download(base+'export?'+query({plan:plan.id,snapshot:current.snapshot}),'iati-publisher-refresh-'+plan.id+'.zip');
  status('The complete publisher refresh workspace and original source history are ready for receiving.');
 });
 $('rf-receive-form').onsubmit=event=>{event.preventDefault();action('Receiving the complete original refresh workspace…',async()=>{
  await checkedContext();if(hasPending())throw new Error('Continue the saved refresh action before receiving another workspace.');
  const file=$('rf-receive-file').files[0];if(!file)throw new Error('Choose the complete exported refresh ZIP.');
  const result=await(await request(base+'receive',{method:'POST',headers:{'content-type':'application/zip'},body:file})).json();
  if(result.schema!=='stellar-forge.iati-refresh-receiving.v1'||!result.plan?.id||result.currentPlan?.id!==result.plan.id||!hash.test(result.snapshot??'')||!hash.test(result.currentSnapshot??''))throw new Error('Receive the complete original plan and preserved current workspace result.');
  clean($('rf-receive-result'));properties($('rf-receive-result'),{receivedPlan:result.plan.name,receivedPlanRevision:result.plan.revision,currentPlanRevision:result.currentPlan.revision,receivedJournal:result.snapshot,currentJournal:result.currentSnapshot,...Object.fromEntries(Object.entries(result).filter(([,v])=>v===null||typeof v!=='object'))});
  if(result.currentSnapshot!==result.snapshot)note($('rf-receive-result'),'This package is received. Later saved work remains in the current plan revision '+result.currentPlan.revision+'.','rf-success');
  details($('rf-receive-result'),'Complete original receiving result',result);
  if(api.refreshWorkspace)await api.refreshWorkspace();else await refresh();
  await openPlan(result.currentPlan.id);tab('handover');status('The complete original sources, native portfolio history and refresh journal are received. Current plan revision '+result.currentPlan.revision+' is open.');
 });};
 return{refresh,buttons};
};
