/* MIT. Native AMP commissioning in the original IATI operator. */
'use strict';
window.IatiAmpUi=function(api){
 const $=id=>document.getElementById('amp-'+id),route='/api/iati/amp/',key='sf30.iati.amp.';
 let inventory={captures:[],plans:[],runs:[]},plan=null,draft=null,capture=null,rowsPage=null,selectedRow=null,offset=0;
 let nativeProjects=[],nativeValues={},batchPreview=null,currentRun=null,eventAfter=0,runTimer=null,pending=null,dirty=false;
 const clone=v=>JSON.parse(JSON.stringify(v)),short=v=>String(v??'').slice(0,12);
 const out=(id,value)=>{$(id).textContent=typeof value==='string'?value:JSON.stringify(value,null,2);};
 const token=()=>crypto.randomUUID(),actor=()=>{const value=$('actor').value.trim();if(!value)throw new Error('Enter the operator name.');try{sessionStorage.setItem(key+'actor',value);}catch{}return value;};
 const positive=(v,name)=>{if(!/^[1-9][0-9]*$/.test(String(v)))throw new Error('Select an exact '+name+'.');const n=Number(v);if(!Number.isSafeInteger(n))throw new Error('The selected '+name+' is outside this browser’s exact numeric range.');return n;};
 const optionalId=(id,target,name)=>{const raw=$(id).value.trim();if(raw)target[name]=positive(raw,name);};
 const exactView=raw=>JSON.parse(raw.replace(/"(?:[^"\\]|\\.)*"|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/g,s=>s[0]==='"'?s:JSON.stringify(s)));
 const show=tab=>{document.querySelectorAll('[data-amp-panel]').forEach(el=>el.hidden=el.dataset.ampPanel!==tab);document.querySelectorAll('[data-amp-tab]').forEach(el=>el.setAttribute('aria-selected',String(el.dataset.ampTab===tab)));};
 const call=(path,body)=>body===undefined?api.get(route+path):api.post(route+path,body);
 const q=values=>new URLSearchParams(Object.entries(values).filter(([,v])=>v!==undefined&&v!==null)).toString();
 function options(id,items,chosen){
  const control=$(id),before=chosen??control.value;control.replaceChildren(new Option('Choose a retained record',''));
  for(const item of items)control.add(new Option(String(item.label),String(item.id)));
  if(items.some(item=>String(item.id)===String(before)))control.value=String(before);
 }
 function persistDraft(){dirty=true;try{sessionStorage.setItem(key+'draft',JSON.stringify({id:plan?.id,revision:plan?.revision,definition:draft}));}catch{}buttons();}
 function clearDraft(){dirty=false;try{sessionStorage.removeItem(key+'draft');}catch{}}
 function pendingSave(value){pending=value;try{if(value)sessionStorage.setItem(key+'pending',JSON.stringify(value));else sessionStorage.removeItem(key+'pending');}catch{}buttons();}
 async function mutate(path,payload,credentials){
  if(pending)throw new Error('Receive the previous saved operation before starting another change.');
  const body={...payload,requestId:payload.requestId??token()};
  pendingSave({path,body});
  try{const result=await call(path,{...body,...(credentials?{credentials}:{})});pendingSave(null);return result;}
  catch(error){
   // A complete local rejection leaves the form editable. Interrupted requests keep their original recovery input.
   if([400,401,403,404,405,409,413,415,422].includes(error.status)&&typeof error.details?.error==='string')pendingSave(null);
   throw error;
  }
  finally{if(credentials){credentials.username='';credentials.passwordSha1='';}}
 }
 async function recover(){
  if(!pending)return;
  const result=await call('request?'+q({requestId:pending.body.requestId}));
  if(result.found){pendingSave(null);await refresh();if(result.result?.id)await openPlan(result.result.id);if(result.result?.runId)await openRun(result.result.runId);api.status('The original operation was received from its saved result.');return;}
  if(pending.path.startsWith('native/')){const secret=await credentials(),original=pending;pendingSave(null);const received=await mutate(original.path,original.body,secret);await refresh();if(received.runId)await openRun(received.runId);if(received.captureId)await openCapture(received.captureId);api.status('The original native operation was continued with its saved input.');return;}
  const original=pending;pendingSave(null);
  const saved=await mutate(original.path,original.body);await afterSave(saved);
 }
 async function afterSave(result){
  clearDraft();await refresh();if(result.id)await openPlan(result.id);api.status('AMP commissioning revision saved.');
 }
 async function refresh(){
  inventory=await call('status');
  options('capture-select',inventory.captures.map(c=>({id:c.id,label:c.name+' · '+c.connection.label+' · '+c.coverage.projectIds.length+' projects'})));
  options('plan-select',inventory.plans.map(p=>({id:p.id,label:p.name+' · r'+p.revision+' · '+p.state})),plan?.id);
  options('portfolio',api.portfolioList().map(p=>({id:p.id,label:(p.name??p.definition?.name??short(p.id))+' · r'+p.revision})));
  options('next-portfolio',api.portfolioList().map(p=>({id:p.id,label:(p.name??p.definition?.name??short(p.id))+' · r'+p.revision})));
  options('next-capture',inventory.captures.map(c=>({id:c.id,label:c.name+' · '+c.connection.label})));
  options('run-select',inventory.runs.filter(r=>!plan||r.plan===plan.id).map(r=>({id:r.id,label:short(r.id)+' · '+r.state+' · '+r.projectCount+' projects'})),currentRun?.id);
  api.metrics($('inventory'),[['Native captures',inventory.captures.length],['Commissioning plans',inventory.plans.length],['Native receiving operations',inventory.runs.length]]);
  buttons();
 }
 async function openCapture(id){
  if(!id)throw new Error('Choose a retained native AMP capture.');
  capture=await call('capture?'+q({id}));nativeProjects=exactView(capture.projectsJson);nativeValues=exactView(capture.valuesJson);
  $('capture-select').value=id;
  out('capture-summary',{name:capture.name,connection:capture.connection,coverage:capture.coverage,acquisition:capture.acquisition,createdAt:capture.createdAt});
  $('capture-json').value=capture.projectsJson;fillCaptureSource();mapping();buttons();
 }
 function fillCaptureSource(){if(capture){const field=$('source-kind').value;$('capture-json').value=capture[field]??'';}}
 async function openPlan(id,revision){
  if(!id)throw new Error('Choose a saved AMP plan.');
  plan=await call('plan?'+q({id,revision}));draft=clone(plan.definition);clearDraft();
  $('plan-select').value=id;$('name').value=draft.name;$('notes').value=draft.notes;
  await openCapture(draft.captureId);
  out('plan-summary',{name:draft.name,revision:plan.revision,state:plan.state,portfolio:draft.portfolio,nativeCapture:short(draft.captureId),counts:plan.counts,review:plan.review});
  api.metrics($('plan-metrics'),[['Included',plan.counts.included??0],['Excluded',plan.counts.excluded??0],['Review',plan.counts.review??0],['Revision',plan.revision]]);
  offset=0;selectedRow=null;batchPreview=null;await loadRows();await history();mapping();
  $('definition').value=JSON.stringify(draft,null,2);buttons();
 }
 async function loadRows(){
  if(!plan)return;
  rowsPage=await call('rows?'+q({id:plan.id,revision:plan.revision,offset,limit:50,state:$('row-state').value||undefined}));
  rowTable();api.table($('financial-groups'),['dimensions','count','amount'],rowsPage.financialGroups);buttons();
 }
 function rowTable(){
  const holder=$('rows');holder.replaceChildren();const table=document.createElement('table'),head=document.createElement('tr');
  for(const label of ['Original activity','Collection / type','Amount','Date / period','Decision','Review']){const th=document.createElement('th');th.textContent=label;head.append(th);}
  const thead=document.createElement('thead');thead.append(head);table.append(thead);const body=document.createElement('tbody');
  for(const item of rowsPage?.rows??[]){
   const tr=document.createElement('tr');tr.setAttribute('aria-selected',String(item.key===selectedRow?.key));
   const r=item.sourceRow,values=[item.publisherRef+'\n'+item.activityId,item.collection+' · '+(r.transaction_type||r.budget_type||''),(r.value_decimal??r.value??'')+' '+(r.currency??''),r.transaction_day||[r.period_start_day,r.period_end_day].filter(Boolean).join(' to ')||r.value_day||'',item.state];
   for(const [i,value]of values.entries()){const td=document.createElement('td');td.textContent=value;if(i===2)td.className='amp-amount';tr.append(td);}
   const td=document.createElement('td'),button=document.createElement('button');button.type='button';button.textContent='Open record';button.onclick=()=>api.action('Opening the complete original financial record…',async()=>openRow(item));td.append(button);tr.append(td);body.append(tr);
  }
  table.append(body);holder.append(table);out('row-page',rowsPage.total?String(offset+1)+'–'+Math.min(offset+50,rowsPage.total)+' of '+rowsPage.total+' selected records':'No records in this view.');
 }
 function openRow(item){
  selectedRow=item;const d=draft.decisions[item.key]??{action:'review',note:''};out('row-original',item.sourceRow);out('row-findings',item.issues);
  $('row-action').value=d.action;$('row-note').value=d.note;
  for(const[id,key]of [['row-funding','fundingId'],['row-donor','donorId'],['row-transaction','transactionId']])$(id).value=d[key]??'';
  $('row-funding-json').value=d.fundingJson??'';$('row-transaction-json').value=d.transactionJson??'';$('row-date').value=d.dateChoice??'transaction-date';
  out('row-proposal',item.proposal??'Complete the original mapping and decision to prepare this record.');
  nativeFinancialTable(item);rowTable();buttons();
 }
 function nativeFinancialTable(item){
  const link=draft.activityLinks.find(l=>l.publisherRef===item.publisherRef&&l.activityId===item.activityId);
  const project=link?.projectId?nativeProjects.find(p=>String(p.internal_id)===String(link.projectId)):null;
  const holder=$('native-register');holder.replaceChildren();
  if(!project){out('native-register','Select a captured native project in Activity mapping to inspect its funding records.');return;}
  const table=document.createElement('table'),head=document.createElement('tr');
  for(const text of ['Funding / donor','Family','Transaction','Original native amount','Date','Choose']){const th=document.createElement('th');th.textContent=text;head.append(th);}
  const thead=document.createElement('thead');thead.append(head);table.append(thead);const body=document.createElement('tbody');
  for(const funding of project.fundings??[]){
   const entries=['commitments','disbursements','expenditures'].flatMap(family=>(funding[family]??[]).map(transaction=>({family,transaction})));
   if(!entries.length)entries.push({family:'Funding only',transaction:{}});
   for(const{family,transaction}of entries){
    const tr=document.createElement('tr');
    for(const value of [String(funding.funding_id??'')+' / '+String(funding.donor_organization_id??''),family,transaction.transaction_id??'',String(transaction.transaction_amount??'')+' · currency '+String(transaction.currency??''),transaction.transaction_date??'']){const td=document.createElement('td');td.textContent=value;tr.append(td);}
    const td=document.createElement('td'),b=document.createElement('button');b.type='button';b.textContent='Use native IDs';b.onclick=()=>{$('row-funding').value=funding.funding_id??'';$('row-donor').value=funding.donor_organization_id??'';$('row-transaction').value=transaction.transaction_id??'';};td.append(b);tr.append(td);body.append(tr);
   }
  }
  table.append(body);holder.append(table);
 }
 function valueOptions(field){
  const found=new Map();function visit(value){if(Array.isArray(value)){value.forEach(visit);return;}if(!value||typeof value!=='object')return;
   if(value.id!==undefined){const name=value.label??value.name??value.value??value.translation??'';found.set(String(value.id),{id:String(value.id),label:String(value.id)+' · '+(typeof name==='object'?JSON.stringify(name):name)});}
   for(const [k,v]of Object.entries(value))if(['children','values','possible_values','items'].includes(k))visit(v);
  }visit(nativeValues[field]);return[...found.values()];
 }
 function mapping(){
  if(!draft||!capture)return;
  const native=nativeProjects.map(p=>({id:'project:'+p.internal_id,label:'AMP '+p.internal_id+' · '+(p.project_title??p.title??p.iati_identifier??p.amp_id??'')}));
  const targetOptions=[...native,...Object.keys(draft.projectDrafts??{}).map(id=>({id:'draft:'+id,label:'New draft · '+id}))];
  options('activity-target',targetOptions);
  api.table($('activity-links'),['publisherRef','activityId','projectId','draftId','note'],draft.activityLinks);
  api.table($('currency-links'),['code','nativeId','note'],draft.currencyLinks);
  api.table($('measure-links'),['sourceType','family','adjustmentId','note'],draft.measureLinks);
  const currencyFields=['fundings~commitments~currency','fundings~disbursements~currency','fundings~expenditures~currency'];
  const currencies=new Map();currencyFields.flatMap(valueOptions).forEach(x=>currencies.set(x.id,x));options('currency-native',[...currencies.values()]);
  flowOptions();options('bulk-donor',valueOptions('fundings~donor_organization_id'));
  $('definition').value=JSON.stringify(draft,null,2);
 }
 function flowOptions(){const family={2:'commitments',3:'disbursements',4:'expenditures'}[$('measure-type').value];options('measure-adjustment',valueOptions('fundings~'+family+'~adjustment_type'));}
 function updateLink(collection,item,match){const index=draft[collection].findIndex(match);if(index<0)draft[collection].push(item);else draft[collection][index]=item;persistDraft();mapping();}
 async function saveDraft(){
  if(!draft)throw new Error('Create or open an AMP plan.');
  draft.name=$('name').value.trim();draft.notes=$('notes').value;
  const result=await mutate('plan',{id:plan.id,expectedRevision:plan.revision,definition:draft,actor:actor()});await afterSave(result);
 }
 function decision(prefix){
  const result={action:$(prefix+'-action').value,note:$(prefix+'-note').value.trim(),dateChoice:$(prefix+'-date').value};
  if(!result.note)throw new Error('Enter the decision and scope note.');
  for(const[id,name]of [['funding','fundingId'],['donor','donorId'],['transaction','transactionId']])if($(prefix+'-'+id))optionalId(prefix+'-'+id,result,name);
  for(const[id,name]of [['funding-json','fundingJson'],['transaction-json','transactionJson']])if($(prefix+'-'+id)?.value.trim())result[name]=$(prefix+'-'+id).value;
  return result;
 }
 function scope(){
  const result={all:true,undecidedOnly:$('bulk-undecided').checked};
  for(const[id,key]of [['publisher','publisherRefs'],['activity','activityIds'],['currency','currencies'],['type','transactionTypes'],['collection','collections']]){
   const value=$('bulk-'+id).value.trim();if(value)result[key]=[value];
  }return result;
 }
 async function credentials(){
  const username=$('native-user').value.trim(),password=$('native-password').value;
  if(!username||!password)throw new Error('Enter the existing AMP username and password for this operation.');
  $('native-password').value='';
  const bytes=await crypto.subtle.digest('SHA-1',new TextEncoder().encode(password));
  return{username,passwordSha1:[...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('')};
 }
 function connection(){
  const result={baseUrl:$('native-url').value.trim(),workspaceId:positive($('native-workspace').value,'AMP workspace ID'),installedVersion:$('native-version').value.trim(),label:$('native-label').value.trim()};
  optionalId('native-user-id',result,'expectedUserId');return result;
 }
 async function history(){
  if(!plan)return;const result=await call('history?'+q({id:plan.id}));
  api.table($('history'),['revision','state','actor','updatedAt','counts'],result.history.map(p=>({revision:p.revision,state:p.state,actor:p.actor,updatedAt:p.updatedAt,counts:p.counts})));
 }
 async function openRun(id){
  if(!id)throw new Error('Select the original native receiving operation.');
  currentRun=await call('run?'+q({id}));$('run-select').value=id;out('run-summary',{id:currentRun.id,state:currentRun.state,plan:currentRun.plan,revision:currentRun.revision,connection:currentRun.connection,projectCount:currentRun.projectCount,updatedAt:currentRun.updatedAt});
  api.table($('run-steps'),['key','mode','originalId','afterId','state'],currentRun.steps);
  options('reconcile-step',currentRun.steps.filter(s=>s.state!=='prepared'&&s.state!=='complete').map(s=>({id:s.key,label:s.key+' · '+s.state})));
  await readEvents(true);buttons();
  clearTimeout(runTimer);if(['running','prepared','queued'].includes(currentRun.state))runTimer=setTimeout(()=>{if(!api.isBusy())api.action('Reading original AMP receiving progress…',()=>openRun(id));},2500);
 }
 async function readEvents(reset=false){
  if(!currentRun)return;if(reset){eventAfter=0;$('events').replaceChildren();}
  const page=await call('events?'+q({id:currentRun.id,after:eventAfter,limit:100}));
  const pre=document.createElement('pre');pre.textContent=JSON.stringify(page.events,null,2);$('events').append(pre);eventAfter=page.nextAfter??0;$('more-events').disabled=page.nextAfter===null;
 }
 function bind(id,message,fn){$(id).addEventListener('click',()=>api.action(message,fn));}
 function form(id,message,fn){$(id).addEventListener('submit',e=>{e.preventDefault();api.action(message,fn);});}
 function requireSaved(){if(!plan)throw new Error('Open an AMP plan.');if(dirty)throw new Error('Save the complete mapping changes before this operation.');}
 function buttons(){
  const busy=api.isBusy();$('save').disabled=busy||!draft||!!pending;$('recover').hidden=!pending;$('recover').disabled=busy||!pending;
  out('pending-note',pending?'Operation '+pending.body.requestId+' is retained. Receive its original result before another change.':'');
  out('draft-note',dirty?'Mapping changes are open in this browser. Save them as a complete plan revision.':'');
  for(const id of ['review','prepare','start','export','report','analysis','comparison','requests','rows-file','advance'])$(id).disabled=busy||!plan||!!pending||(id==='comparison'&&!plan?.comparison)||(id==='requests'&&!plan?.prepared)||(id==='prepare'&&plan?.state==='prepared');
  $('row-save').disabled=busy||!selectedRow||!!pending;$('rows-prev').disabled=busy||offset===0;$('rows-next').disabled=busy||rowsPage?.nextOffset==null;
  $('bulk-apply').disabled=busy||!batchPreview||!!pending||dirty;$('continue').disabled=busy||!currentRun;$('reconcile').disabled=busy||!currentRun;
 }
 document.querySelectorAll('[data-amp-tab]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.ampTab)));
 $('source-kind').onchange=fillCaptureSource;$('measure-type').onchange=flowOptions;
 $('portfolio').onchange=()=>{const p=api.portfolioList().find(x=>x.id===$('portfolio').value);$('portfolio-revision').value=p?.revision??'';};
 $('next-portfolio').onchange=()=>{const p=api.portfolioList().find(x=>x.id===$('next-portfolio').value);$('next-revision').value=p?.revision??'';};
 for(const id of ['name','notes'])$(id).addEventListener('input',()=>{if(draft){draft.name=$('name').value;draft.notes=$('notes').value;persistDraft();}});
 bind('open','Opening the saved AMP commissioning plan…',()=>openPlan($('plan-select').value));
 bind('capture-open','Opening the complete original AMP capture…',()=>openCapture($('capture-select').value));
 bind('save','Saving the complete AMP mapping and financial decisions…',saveDraft);bind('recover','Receiving the original AMP operation…',recover);
 form('capture-import-form','Retaining the complete original native capture…',async()=>{const file=$('capture-import').files[0];if(!file)throw new Error('Choose the complete native capture JSON.');const value=JSON.parse(await file.text());const result=await mutate('capture',{capture:value,actor:actor()});await refresh();await openCapture(result.captureId);api.status('Complete native AMP source retained.');});
 form('native-capture-form','Capturing the selected full projects from the existing AMP session…',async()=>{
  const ids=$('native-project-ids').value.split(/[\s,]+/).filter(Boolean).map(v=>positive(v,'native project ID'));
  const result=await mutate('native/capture',{connection:connection(),projectIds:ids,coverageNote:$('native-coverage').value,name:$('native-name').value,actor:actor()},await credentials());
  await refresh();await openCapture(result.captureId);api.status('Actual native fields, possible values, session and full selected projects retained.');
 });
 form('new-form','Saving the complete original source selection…',async()=>{
  const captureId=$('capture-select').value;if(!captureId)throw new Error('Select the retained native AMP capture.');
  const definition={name:$('name').value.trim(),notes:$('notes').value,portfolio:{id:$('portfolio').value,revision:positive($('portfolio-revision').value,'portfolio revision')},captureId,activityLinks:[],currencyLinks:[],measureLinks:[],projectDrafts:{},decisions:{},correspondence:[]};
  await afterSave(await mutate('plan',{definition,actor:actor()}));show('mapping');
 });
 form('activity-form','Recording the original activity correspondence…',async()=>{
  if(!draft)throw new Error('Create or open a plan.');const target=$('activity-target').value;
  const item={publisherRef:$('activity-publisher').value.trim(),activityId:$('activity-id').value.trim(),note:$('activity-note').value.trim()};
  if(target.startsWith('project:'))item.projectId=positive(target.slice(8),'native project ID');else if(target.startsWith('draft:'))item.draftId=target.slice(6);else throw new Error('Select the original native project or complete draft.');
  updateLink('activityLinks',item,l=>l.publisherRef===item.publisherRef&&l.activityId===item.activityId);api.status('Activity mapping is ready to save with this plan.');
 });
 form('currency-form','Recording the installed native currency mapping…',async()=>{if(!draft)throw new Error('Open a plan.');const item={code:$('currency-code').value.trim(),nativeId:positive($('currency-native').value,'native currency ID'),note:$('currency-note').value.trim()};updateLink('currencyLinks',item,l=>l.code===item.code);});
 form('measure-form','Recording the original financial family and actual category…',async()=>{if(!draft)throw new Error('Open a plan.');const sourceType=$('measure-type').value,item={sourceType,family:{2:'commitments',3:'disbursements',4:'expenditures'}[sourceType],adjustmentId:positive($('measure-adjustment').value,'native actual adjustment ID'),meaning:'actual',note:$('measure-note').value.trim()};updateLink('measureLinks',item,l=>l.sourceType===item.sourceType);});
 form('draft-form','Retaining the complete new native project draft…',async()=>{if(!draft)throw new Error('Open a plan.');const id=$('project-draft-id').value.trim();if(!id)throw new Error('Enter the draft name.');const raw=$('project-draft-json').value;const view=exactView(raw);if(!view.iati_identifier||view.internal_id)throw new Error('Use a complete new project object with its IATI identifier.');draft.projectDrafts??={};draft.projectDrafts[id]=raw;persistDraft();mapping();});
 bind('definition-apply','Applying the complete reviewed mapping…',async()=>{if(!plan)throw new Error('Open a saved plan.');draft=JSON.parse($('definition').value);persistDraft();mapping();api.status('Complete mapping loaded. Save to retain this revision.');});
 $('row-state').onchange=()=>api.action('Reading the selected financial decisions…',async()=>{offset=0;await loadRows();});
 bind('rows-prev','Reading previous original rows…',async()=>{offset=Math.max(0,offset-50);await loadRows();});
 bind('rows-next','Reading the next original rows…',async()=>{offset=rowsPage.nextOffset??offset;await loadRows();});
 form('row-form','Saving this original financial row decision…',async()=>{if(!selectedRow)throw new Error('Open a financial record.');draft.decisions[selectedRow.key]={...decision('row'),sourceRowSha256:selectedRow.sourceRowSha256};persistDraft();await saveDraft();});
 bind('bulk-preview','Reading the complete selected programme scope…',async()=>{requireSaved();batchPreview=await call('decision/preview',{id:plan.id,revision:plan.revision,selection:scope()});out('bulk-summary',{count:batchPreview.count,selection:batchPreview.selection,selectedSha256:batchPreview.selectedSha256});api.table($('bulk-groups'),['dimensions','count'],batchPreview.groups);buttons();});
 bind('bulk-apply','Applying the decision to every retained row in this selected scope…',async()=>{requireSaved();if(!batchPreview)throw new Error('Preview the complete scope.');await afterSave(await mutate('decision/apply',{id:plan.id,expectedRevision:plan.revision,selection:batchPreview.selection,selectedSha256:batchPreview.selectedSha256,decision:decision('bulk'),actor:actor()}));});
 bind('review','Recording the complete financial review…',async()=>{requireSaved();await afterSave(await mutate('review',{id:plan.id,expectedRevision:plan.revision,analysisSha256:plan.analysis.sha256,actor:actor(),decision:$('review-decision').value,note:$('review-note').value}));});
 bind('prepare','Preparing complete native project requests…',async()=>{requireSaved();await afterSave(await mutate('prepare',{id:plan.id,expectedRevision:plan.revision,actor:actor()}));show('receiving');});
 bind('start','Starting the original native AMP receiving operation…',async()=>{requireSaved();if(!plan.prepared)throw new Error('Prepare the reviewed whole projects first.');const result=await mutate('native/start',{id:plan.id,expectedRevision:plan.revision,preparedSha256:plan.prepared.sha256,actor:actor()},await credentials());await refresh();await openRun(result.runId);});
 bind('run-open','Reading the original native operation…',()=>openRun($('run-select').value));
 bind('continue','Continuing the same native receiving operation…',async()=>{if(!currentRun)throw new Error('Open the original receiving operation.');const secret=await credentials();try{await call('native/continue',{runId:currentRun.id,credentials:secret});}finally{secret.username='';secret.passwordSha1='';}await openRun(currentRun.id);});
 bind('reconcile','Receiving the actual native project for this original operation…',async()=>{if(!currentRun)throw new Error('Open the original receiving operation.');await mutate('native/reconcile',{runId:currentRun.id,stepKey:$('reconcile-step').value,nativeId:positive($('reconcile-native-id').value,'received project ID'),actor:actor(),note:$('reconcile-note').value},await credentials());await openRun(currentRun.id);});
 bind('more-events','Reading the next original native event page…',()=>readEvents());
 for(const[id,kind,name]of [['report','report','AMP_Commissioning_Report.html'],['analysis','analysis','AMP_Financial_Review.json'],['comparison','comparison','AMP_Following_Edition.json'],['requests','prepared','AMP_Complete_Native_Requests.json'],['rows-file','sourceRows','IATI_Original_Financial_Rows.json']])
  bind(id,'Opening the complete retained '+kind+'…',()=>api.download(route+'file?'+q({id:plan.id,revision:plan.revision,kind}),name));
 bind('export','Preparing the complete AMP application and source handover…',()=>api.download(route+'export?'+q({id:plan.id,revision:plan.revision}),'AMP_Commissioning.zip'));
 form('receive-form','Receiving the complete AMP application, original sources and workspace history…',async()=>{const file=$('receive-file').files[0];if(!file)throw new Error('Select the complete AMP handover ZIP.');const result=await(await api.request(route+'receive',{method:'POST',headers:{'content-type':'application/zip'},body:file})).json();out('receive-result',result);await api.refreshWorkspace();if(result.selection?.id)await openPlan(result.selection.id,result.selection.revision);else if(result.plan?.id)await openPlan(result.plan.id);else if(result.id)await openPlan(result.id);api.status('Complete AMP handover received.');});
 form('advance-form','Preparing the following original publisher edition…',async()=>{requireSaved();const raw={id:plan.id,revision:plan.revision,portfolio:{id:$('next-portfolio').value,revision:positive($('next-revision').value,'following portfolio revision')},captureId:$('next-capture').value,name:$('next-name').value,actor:actor(),notes:$('next-notes').value};if($('next-pairs').value.trim())raw.correspondence=JSON.parse($('next-pairs').value);await afterSave(await mutate('advance',raw));show('review');});
 try{$('actor').value=sessionStorage.getItem(key+'actor')??'';pending=JSON.parse(sessionStorage.getItem(key+'pending')??'null');}catch{}
 const savedDraft=(()=>{try{return JSON.parse(sessionStorage.getItem(key+'draft')??'null');}catch{return null;}})();
 bind('restore-draft','Restoring the complete unsaved mapping…',async()=>{if(!savedDraft?.id)throw new Error('There is no retained browser draft.');await openPlan(savedDraft.id);if(plan.revision!==savedDraft.revision)throw new Error('The plan has advanced. Open the saved mapping before applying earlier edits.');draft=savedDraft.definition;persistDraft();mapping();});
 $('restore-draft').hidden=!savedDraft;show('source');buttons();
 return{refresh,buttons,openPlan};
};
