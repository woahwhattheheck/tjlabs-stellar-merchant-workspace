/* MIT. Complete organisation planning in the original IATI console. */
'use strict';
window.IatiOrganisationUi=function(api){
 const $=id=>document.getElementById(id),base='/api/iati/organisation/';
 const {get,post,request,action,status,download,metrics,table,properties,details}=api;
 const q=value=>new URLSearchParams(Object.entries(value).filter(([,v])=>v!==undefined&&v!==null).map(([k,v])=>[k,String(v)])).toString();
 const text=value=>value===null||value===undefined?'':typeof value==='object'?JSON.stringify(value):String(value);
 const short=value=>text(value).slice(0,12);
 const labelled=value=>text(value).replaceAll('-',' ').replaceAll('_',' ');
 const lines=id=>$(id).value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
 const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
 let catalogue={plans:[],sources:[]},profile=null,plan=null,history=[],page=null,detail=null,drafts=[],issues=[],pending=null,workspaceKey=null,db=null;
 let activeTab='selection',pageSelection=null,detailSelection=null,targetElementXml='';
 const latest=()=>plan&&catalogue.plans.find(x=>x.id===plan.id)?.revision===plan.revision;
 const who=()=>{const value=$('org-actor').value.trim();if(!value)throw new Error('Enter the named operator above.');return value;};
 const selectedPlan=result=>result?.plan??result;
 function options(id,items,selected,empty='Choose a retained record'){
  const el=$(id),old=selected??el.value;el.replaceChildren(new Option(items.length?empty:'No retained records',''));
  for(const x of items)el.add(new Option(x.label,x.id));
  el.value=items.some(x=>String(x.id)===String(old))?String(old):items[0]?.id??'';
 }
 function clear(holder,message){holder.replaceChildren();holder.classList.toggle('empty',!!message);if(message)holder.textContent=message;}
 function tab(name){
  activeTab=name;
  document.querySelectorAll('[data-org-panel]').forEach(el=>el.hidden=el.dataset.orgPanel!==name);
  document.querySelectorAll('[data-org-view]').forEach(el=>el.setAttribute('aria-current',el.dataset.orgView===name?'step':'false'));
 }
 async function storage(mode,value){
  if(!workspaceKey)throw new Error('Open this original organisation workspace first.');
  if(!db)db=await new Promise((resolve,reject)=>{const r=indexedDB.open('sf30-iati-organisation-actions',1);
   r.onupgradeneeded=()=>r.result.createObjectStore('actions',{keyPath:'key'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  return await new Promise((resolve,reject)=>{
   const tx=db.transaction('actions',mode==='read'?'readonly':'readwrite'),store=tx.objectStore('actions');
   const key=workspaceKey+(mode==='archive'?':rejected:'+value.input.requestId:'');
   const r=mode==='read'?store.get(key):mode==='delete'?store.delete(key):store.put({...value,key});
   let result;r.onsuccess=()=>{result=r.result;};tx.oncomplete=()=>resolve(result);
   tx.onerror=tx.onabort=()=>reject(tx.error||new Error('The complete action could not be retained in this browser.'));
  });
 }
 function buttons(){
  const busy=api.isBusy?.()??false,editable=!!plan&&latest();
  $('org-pending').hidden=!pending;$('org-revise').hidden=!pending?.rejected;
  $('org-pending-note').textContent=pending?'Saved '+pending.route+' request '+pending.input.requestId+'. Its complete selection is retained for continuation.':'';
  for(const el of document.querySelectorAll('[data-org-save]'))el.disabled=busy||!!pending||(!!plan&&!editable);
  for(const el of document.querySelectorAll('[data-org-edit]'))el.disabled=busy||!!pending||!editable||!detail;
  for(const el of document.querySelectorAll('[data-org-review]'))el.disabled=busy||!!pending||!editable||drafts.length>0;
  $('org-release').disabled=busy||!!pending||!editable||plan?.state!=='REVIEWED'||!!plan.release||!plan?.review||plan.review.decision!=='approve'||drafts.length>0;
  $('org-rows-prev').disabled=busy||!page||page.offset===0;
  $('org-rows-next').disabled=busy||!page||page.offset+page.rows.length>=page.total;
  $('org-open').disabled=busy||!$('org-plan-select').value;
  $('org-profile-open').disabled=busy||!$('org-source').value;
  $('org-retry').disabled=$('org-reconcile').disabled=busy||!pending;
  $('org-clear-edits').disabled=busy||!drafts.length;
  for(const id of ['org-export','org-file-source','org-file-candidate','org-file-report','org-file-budgets','org-file-documents'])$(id).disabled=busy||!plan;
  $('org-edit-count').textContent=drafts.length?drafts.length+' additional prepared correction'+(drafts.length===1?'':'s')+'.':'';
  const op=$('org-edit-operation').value;
  $('org-edit-attribute-label').hidden=!['attribute','attribute-remove'].includes(op);
  $('org-edit-value-label').hidden=!['text','attribute'].includes(op);
  $('org-edit-xml-label').hidden=!['replace','append'].includes(op);
 }
 function organisationChoices(selected){
  const selectedKeys=new Set(selected??[...$('org-organisations').querySelectorAll('input:checked')].map(x=>x.value));
  clear($('org-organisations'),profile?.organisations?.length?'':'Open an organisation source to select its organisations.');
  for(const row of profile?.organisations??[]){
   const label=document.createElement('label');label.className='organisation-check';
   const input=document.createElement('input');input.type='checkbox';input.value=row.key;input.checked=selectedKeys.has(row.key);
   const span=document.createElement('span'),small=document.createElement('small');
   const names=Array.isArray(row.names)?row.names.map(x=>typeof x==='string'?x:x.text??x.value??'').filter(Boolean).join(' / '):text(row.names);
   span.textContent=names||row.identifier||'Organisation '+row.ordinal;
   small.textContent=[row.identifier,row.defaultCurrency,row.defaultLanguage,row.budgetCount+' budget records',row.documentCount+' documents'].filter(Boolean).join(' · ');
   span.append(small);label.append(input,span);$('org-organisations').append(label);
  }
  const records=(profile?.organisations??[]).map(x=>({id:x.key,label:(x.identifier||'Organisation '+x.ordinal)+' · '+short(x.key)}));
  const select=$('org-record-organisation'),old=select.value;select.replaceChildren(new Option('All selected organisations',''));
  for(const row of records)select.add(new Option(row.label,row.id));select.value=records.some(x=>x.id===old)?old:'';
 }
 function sourceIdentity(){
  const source=profile?.source;if(!source)return;
  $('org-source-identity').textContent=[source.label||source.name,source.id,source.bytes+' complete original bytes'].join('\n');
  clear($('org-profile'));
  metrics($('org-profile'),[['Organisations',profile.organisations.length],['Budget / expenditure records',profile.budgetCount],['Planning documents',profile.documentCount]]);
  details($('org-profile'),'Complete original source profile',profile);
 }
 async function openSource(sourceId,{selectedKeys}={}){
  if(!sourceId)throw new Error('Choose the complete organisation publisher file.');
  profile=await get(base+'profile?'+q({sourceId}));$('org-source').value=sourceId;
  sourceIdentity();organisationChoices(selectedKeys??(plan?.sourceId===sourceId?plan.organisationKeys:profile.organisations.map(x=>x.key)));
 }
 async function refresh(){
  catalogue=await get(base+'status');
  if(!Array.isArray(catalogue.plans)||!Array.isArray(catalogue.sources))throw new Error('The complete organisation inventory was not returned.');
  if(!workspaceKey){workspaceKey=catalogue.workspaceSha256;
   if(!workspaceKey)workspaceKey=(await get('/api/iati/publishing/context')).workspaceSha256;
   pending=await storage('read')??null;
  }
  options('org-plan-select',catalogue.plans.map(x=>({id:x.id,label:x.name+' · revision '+x.revision})),plan?.id);
  options('org-source',catalogue.sources.map(x=>({id:x.id,label:(x.label||x.name)+' · '+short(x.id)})),profile?.source?.id??plan?.sourceId);
  if(!plan)metrics($('org-counts'),[['Organisation sources',catalogue.sources.length],['Saved plans',catalogue.plans.length]]);
  buttons();
 }
 function snapshot(view=$('org-record-view').value){
  if(plan)return {id:plan.id,revision:plan.revision,view};
  const sourceId=profile?.source?.id??$('org-source').value;
  if(!sourceId)throw new Error('Select an original source or a saved plan.');
  return {sourceId,view:'source'};
 }
 function form(value=null){
  plan=value;detail=null;page=null;pageSelection=null;detailSelection=null;drafts=[];
  $('org-name').value=value?.name??'';$('org-notes').value=value?.notes??'';
  const assessment=value?.assessment??{};
  $('org-asof').value=assessment.asOf??new Date().toISOString().slice(0,10);
  $('org-fiscal-start').value=assessment.fiscalYearStart??'';
  $('org-forward-years').value=assessment.forwardYears??3;
  $('org-methodology').value=assessment.methodology??'iati203';
  $('org-operating-countries').value=(assessment.operatingCountries??[]).join('\n');
  const acquisition=value?.acquisition??{};
  for(const[id,key]of [['org-source-url','sourceUrl'],['org-retrieved-at','retrievedAt'],['org-licence','licence'],['org-licence-url','licenceUrl'],['org-acquisition-notes','notes']])$(id).value=acquisition[key]??'';
  $('org-plan-title').textContent=value?'Prepare the next complete planning revision':'Create an organisation plan';
  $('org-edition').textContent=value?value.name+' · revision '+value.revision+' · '+value.id+(latest()?'':' · historical revision'):'New organisation plan.';
  clear($('org-record-detail'),'Open a budget or document row to read its complete detail.');$('org-record-xml').textContent='';
  clear($('org-rows'),'Read the selected source records.');$('org-rows-page').textContent='';
  $('org-edit-target').replaceChildren();renderDrafts();renderPlan();
 }
 function planningView(holder,value){
  clear(holder);
  if(!value){holder.textContent='Save a plan to read its complete planning analysis.';return;}
  const plain={},complex=[];
  for(const [key,item]of Object.entries(value)){
   if(item===null||typeof item!=='object')plain[key]=item;else complex.push([key,item]);
  }
  if(Object.keys(plain).length)properties(holder,plain);
  for(const [key,item]of complex){
   const section=document.createElement('section'),h=document.createElement('h3');section.className='report-section';h.textContent=labelled(key);section.append(h);holder.append(section);
   if(Array.isArray(item)&&item.length&&item.every(x=>x&&typeof x==='object'&&!Array.isArray(x))){
    const columns=[...new Set(item.flatMap(x=>Object.keys(x)))],box=document.createElement('div');section.append(box);table(box,columns,item);
   }else details(section,'Read complete '+labelled(key),item);
  }
 }
 function renderPlan(){
  if(!plan){for(const id of ['org-planning','org-validation','org-methodology-detail','org-review-result','org-release-summary'])clear($(id),'Open a saved planning revision.');buttons();return;}
  const summary=plan.summary??{};
  metrics($('org-counts'),[['Saved revision',plan.revision],['Selected organisations',plan.organisationKeys.length],['Candidate',short(plan.candidateSha256)],['Review',plan.review?.decision??'Draft']]);
  planningView($('org-planning'),summary);
  const validation=plan.validation??summary.validation??plan.candidateValidation;
  clear($('org-validation'));if(validation){properties($('org-validation'),{state:validation.state,sourceSha256:validation.sourceSha256,errors:validation.errors?.length??validation.errorCount??0});
   if(validation.errors?.length)table($('org-validation'),['line','column','message'],validation.errors);details($('org-validation'),'Complete original organisation validation',validation);
  }else details($('org-validation'),'Saved validation and source context',plan);
  clear($('org-methodology-detail'));properties($('org-methodology-detail'),plan.assessment);
  if(summary.methodology)details($('org-methodology-detail'),'Complete dated methodology and interpretation',summary.methodology);
  if(summary.methodologyNotes)details($('org-methodology-detail'),'Methodology source notes',summary.methodologyNotes);
  clear($('org-review-result'));if(plan.review)properties($('org-review-result'),plan.review);
  clear($('org-release-summary'));if(plan.release)properties($('org-release-summary'),plan.release);
  else $('org-release-summary').textContent=plan.review?.decision==='approve'?'This saved review can be released.':'Record the named review for this saved candidate.';
  renderDrafts();buttons();
 }
 async function readHistory(){
  const r=await get(base+'history?'+q({id:plan.id}));history=Array.isArray(r)?r:r.history;
  if(!Array.isArray(history))throw new Error('The complete planning history was not returned.');
  clear($('org-history'));
  for(const row of history){const button=document.createElement('button');button.type='button';button.className='saved';
   button.textContent='Revision '+row.revision+' · '+(row.name??plan.name)+' · '+(row.review?.decision??'Draft')+(row.release?' · released':'');
   button.onclick=()=>action('Opening the saved organisation revision…',()=>openPlan(plan.id,row.revision));$('org-history').append(button);
  }
  const choices=history.map(x=>({id:String(x.revision),label:'Revision '+x.revision+(x.release?' · released':'')}));
  options('org-compare-before',choices,history.at(-2)?.revision??history[0]?.revision);
  options('org-compare-after',choices,plan.revision);options('org-delivery-revision',choices,plan.revision);
 }
 async function readIssues(){
  issues=[];if(!plan){renderIssues();return;}
  let offset=0,snapshotSha256=null,total=null;
  do{
   const r=await get(base+'rows?'+q({...snapshot('candidate'),section:'issues',offset,limit:100}));
   if(!Array.isArray(r.rows)||!Number.isSafeInteger(r.total)||r.total<0||r.offset!==offset)throw new Error('The complete original finding page was not returned.');
   if(snapshotSha256!==null&&snapshotSha256!==r.snapshotSha256||total!==null&&total!==r.total)throw new Error('The selected finding snapshot changed.');
   snapshotSha256=r.snapshotSha256;total=r.total;
   if(!r.rows.length&&offset<total)throw new Error('The original findings are incomplete.');
   issues.push(...r.rows);offset+=r.rows.length;
  }while(offset<total);
  renderIssues();
 }
 function renderIssues(){
  clear($('org-review-issues'),issues.length?'':'No source or planning findings in this saved candidate.');
  const accepted=new Set(plan?.review?.acknowledgedIssueIds??[]);
  for(const row of issues){const label=document.createElement('label');label.className='organisation-check';
   const box=document.createElement('input');box.type='checkbox';box.value=row.id;box.checked=accepted.has(row.id);
   const span=document.createElement('span'),small=document.createElement('small');span.textContent=row.message??row.finding??row.code??'Source finding';
   small.textContent=[row.severity,row.organisationKey,row.path,row.code].filter(Boolean).join(' · ');span.append(small);label.append(box,span);$('org-review-issues').append(label);
  }
 }
 async function openPlan(id,revision){
  if(!id)throw new Error('Choose a saved organisation plan.');
  const value=selectedPlan(await get(base+'plan?'+q({id,revision})));
  form(value);$('org-plan-select').value=value.id;
  await openSource(value.sourceId,{selectedKeys:value.organisationKeys});
  await readHistory();await readIssues();renderPlan();status('Organisation plan revision '+value.revision+' opened with its complete history.');
 }
 function planInput(){
  if(!profile)throw new Error('Read the complete organisation source first.');
  const sourceId=$('org-source').value;
  if(profile.source.id!==sourceId)throw new Error('Read the selected publisher source before saving.');
  const organisationKeys=[...$('org-organisations').querySelectorAll('input:checked')].map(x=>x.value);
  if(!organisationKeys.length)throw new Error('Select at least one original organisation.');
  if(!$('org-asof').value||!$('org-fiscal-start').value)throw new Error('Select the assessment date and fiscal-year start.');
  const assessment={asOf:$('org-asof').value,fiscalYearStart:$('org-fiscal-start').value,forwardYears:Number($('org-forward-years').value),methodology:$('org-methodology').value};
  const countries=lines('org-operating-countries');if(countries.length)assessment.operatingCountries=countries;
  const acquisition={};for(const[id,key]of [['org-source-url','sourceUrl'],['org-retrieved-at','retrievedAt'],['org-licence','licence'],['org-licence-url','licenceUrl'],['org-acquisition-notes','notes']])acquisition[key]=$(id).value;
  return {actor:who(),...(plan?{id:plan.id,expectedRevision:plan.revision}:{}),name:$('org-name').value,sourceId,organisationKeys,assessment,acquisition,
   edits:[...(plan?.sourceId===sourceId?plan.edits??[]:[]),...drafts.map(x=>x.edit)],notes:$('org-notes').value};
 }
 async function send(route,input){
  if(pending&&!same({route,input},{route:pending.route,input:pending.input}))throw new Error('Continue or reconcile the saved action before preparing another change.');
  if(!pending){const retained={route,input,createdAt:new Date().toISOString()};await storage('write',retained);pending=retained;}
  buttons();
  let result;
  try{result=await post(base+route,input);}
  catch(error){if(error.status>=400&&error.status<500){pending={...pending,rejected:true,error:error.message};await storage('write',pending);}buttons();throw error;}
  await storage('delete');pending=null;
  await api.refreshWorkspace();const value=selectedPlan(result);
  if(route==='compare')renderComparison(result);
  else if(value?.id&&value?.revision)await openPlan(value.id,value.revision);
  status('Organisation '+route+' saved'+(value?.revision?' as revision '+value.revision:'')+'.');return result;
 }
 const change=(extra={})=>{if(!plan||!latest())throw new Error('Open the latest saved planning revision.');return {requestId:crypto.randomUUID(),id:plan.id,expectedRevision:plan.revision,...extra};};
 async function save(){const input={requestId:crypto.randomUUID(),...planInput()};return send('save',input);}
 function renderComparison(value){
  clear($('org-comparison'));planningView($('org-comparison'),value);
  const panel=$('org-comparison').closest('[data-org-panel]');if(panel)tab(panel.dataset.orgPanel);
 }
 function money(value){if(!value)return '';return [value.text,value.currency].filter(x=>x!==null&&x!==undefined&&x!=='').join(' ');}
 function narratives(items){return (items??[]).map(x=>typeof x==='string'?x:[x.language?x.language+':':'',x.text??x.value??''].filter(Boolean).join(' ')).join(' / ');}
 function makeLink(value){try{const url=new URL(value);if(!['http:','https:'].includes(url.protocol))return null;const a=document.createElement('a');a.href=url.href;a.textContent=value;a.target='_blank';a.rel='noreferrer noopener';a.className='organisation-source-link';return a;}catch{return null;}}
 function renderRows(){
  const holder=$('org-rows');clear(holder);holder.classList.add('table-scroll');
  const section=$('org-record-section').value;
  const columns=section==='budgets'?['Record','Organisation / recipient','Period','Reported value','Status / value date','Line items']:
   section==='documents'?['Document','Categories / language','Date / recipient countries','Original URL','Record']:
    ['Finding','Severity','Organisation / record','Original reference'];
  const t=document.createElement('table');t.className='organisation-register';const head=document.createElement('thead'),tr=document.createElement('tr'),body=document.createElement('tbody');
  for(const label of columns){const th=document.createElement('th');th.scope='col';th.textContent=label;tr.append(th);}head.append(tr);t.append(head,body);
  for(const row of page.rows){
   const tr=document.createElement('tr');let values;
   if(section==='budgets')values=[row.family,[row.organisationKey,row.recipient?.kind,row.recipient?.ref??row.recipient?.code,narratives(row.recipient?.narratives)].filter(Boolean).join(' · '),
    [row.period?.start,row.period?.end].filter(Boolean).join(' — '),money(row.value),
    [row.status?.raw?'Reported '+row.status.raw:row.status?.effective?'Default '+row.status.effective:'',row.value?.valueDate].filter(Boolean).join(' · '),text(row.lines?.length??0)];
   else if(section==='documents')values=[narratives(row.titles),(row.categories??[]).map(x=>typeof x==='string'?x:x.code).join(', ')+' / '+(row.languages??[]).map(x=>typeof x==='string'?x:x.code).join(', '),
    [row.documentDate,(row.recipientCountries??[]).map(x=>typeof x==='string'?x:x.code).join(', ')].filter(Boolean).join(' · '),row.url,row.id];
   else values=[row.message??row.finding??row.code,row.severity,[row.organisationKey,row.path].filter(Boolean).join(' · '),row.id];
   values.forEach((value,i)=>{const td=document.createElement('td');
    if(section==='documents'&&i===3){const link=makeLink(value);link?td.append(link):td.textContent=text(value);}else td.textContent=text(value);
    if(section==='budgets'&&i===3)td.className='number';
    if(i===0&&section!=='issues'){const button=document.createElement('button');button.type='button';button.className='organisation-open-row';button.textContent=text(value)||'Open record';
     button.onclick=()=>action('Opening the complete original record…',()=>openDetail(row.id));td.replaceChildren(button);}
    tr.append(td);
   });body.append(tr);
  }
  if(!page.rows.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=columns.length;td.textContent='No records in this selected coverage.';tr.append(td);body.append(tr);}
  holder.append(t);$('org-rows-page').textContent=page.total?(page.offset+1)+'–'+(page.offset+page.rows.length)+' of '+page.total+' complete records':'0 records';buttons();
 }
 async function rows(offset=0){
  const selection={...snapshot(),section:$('org-record-section').value,organisationKey:$('org-record-organisation').value||undefined,offset,limit:50};
  if(offset&&page)selection.expectedSnapshot=page.snapshotSha256;
  const next=await get(base+'rows?'+q(selection));
  if(!Array.isArray(next.rows)||next.offset!==offset||!Number.isSafeInteger(next.total))throw new Error('The original register page is incomplete.');
  if(offset&&page&&page.snapshotSha256!==next.snapshotSha256)throw new Error('Read the first page of the selected new snapshot.');
  page=next;pageSelection=selection;detail=null;detailSelection=null;renderRows();
 }
 async function openDetail(rowId){
  const selected=pageSelection?Object.fromEntries(Object.entries(pageSelection).filter(([k])=>!['section','offset','limit'].includes(k))):snapshot();
  if(page)selected.expectedSnapshot=page.snapshotSha256;
  detail=await get(base+'detail?'+q({...selected,rowId}));detailSelection=selected;
  clear($('org-record-detail'));planningView($('org-record-detail'),detail.row);
  $('org-record-xml').textContent=detail.xml??'';
  options('org-edit-target',(detail.targets??[]).map(x=>({id:x.id,label:x.label||x.path||x.kind+' '+short(x.id)})));
  await target();buttons();
 }
 async function target(){
  const row=detail?.targets?.find(x=>x.id===$('org-edit-target').value);
  targetElementXml='';
  $('org-edit-original').textContent=row?[row.path,row.beforeSha256,text(row.value)].filter(Boolean).join('\n'):'Choose a complete original field.';
  const allowed=row?.allowedOperations??(row?.kind==='attribute'?['attribute']:row?.kind==='text'?['text']:['replace','remove','append']);
  const labels={text:'Replace text',attribute:'Set attribute','attribute-remove':'Remove attribute',replace:'Replace complete element',remove:'Remove element',append:'Append complete child element'};
  const operations=allowed.flatMap(value=>value==='attribute'?['attribute','attribute-remove']:[value]);
  options('org-edit-operation',operations.map(id=>({id,label:labels[id]})),operations[0]);
  $('org-edit-attribute').value=row?.attribute??'';$('org-edit-value').value=text(row?.value);$('org-edit-xml').value='';
  if(row?.kind==='element'){
   const resolved=await get(base+'detail?'+q({...detailSelection,rowId:detail.row.id,targetId:row.id}));
   if(resolved.snapshotSha256!==detail.snapshotSha256||resolved.selectedTarget?.id!==row.id||typeof resolved.selectedTarget.xml!=='string')
    throw new Error('The complete selected original element was not returned.');
   targetElementXml=resolved.selectedTarget.xml;
  }
  editOperation();buttons();
 }
 function editOperation(){
  const op=$('org-edit-operation').value;
  if(op==='replace')$('org-edit-xml').value=targetElementXml;
  else if(op==='append')$('org-edit-xml').value='';
  buttons();
 }
 function draft(){
  if(!detail||!plan||!latest())throw new Error('Open a record from the latest planning revision.');
  if(detailSelection?.view!=='candidate'||detailSelection?.id!==plan.id||detailSelection?.revision!==plan.revision)throw new Error('Open this record from the current saved candidate to prepare a correction.');
  const target=detail.targets.find(x=>x.id===$('org-edit-target').value);if(!target)throw new Error('Choose the original field or element.');
  const selectedOperation=$('org-edit-operation').value,operation=selectedOperation==='attribute-remove'?'attribute':selectedOperation;
  const edit={targetId:target.id,beforeSha256:target.beforeSha256,operation};
  if(operation==='text'||operation==='attribute')edit.value=selectedOperation==='attribute-remove'?null:$('org-edit-value').value;
  if(operation==='attribute')edit.attribute=$('org-edit-attribute').value;
  if(operation==='replace'||operation==='append')edit.xml=$('org-edit-xml').value;
  if(drafts.some(x=>x.edit.targetId===edit.targetId))throw new Error('Remove the earlier prepared correction for this field, or save it and reopen the changed candidate before editing it again.');
  drafts.push({label:target.label||target.path||target.id,edit});renderDrafts();status('Correction prepared. Save the complete planning revision to validate the candidate.');
 }
 function renderDrafts(){
  clear($('org-edits'),drafts.length?'':'No additional corrections prepared.');
  drafts.forEach((row,index)=>{const box=document.createElement('div');box.className='row';const span=document.createElement('span'),button=document.createElement('button');span.textContent=labelled(row.edit.operation)+' · '+row.label;button.type='button';button.textContent='Remove prepared correction';button.onclick=()=>{drafts.splice(index,1);renderDrafts();};box.append(span,button);$('org-edits').append(box);});buttons();
 }
 const submit=(id,message,fn)=>$(id).addEventListener('submit',event=>{event.preventDefault();action(message,fn);});
 document.querySelectorAll('[data-org-view]').forEach(button=>button.onclick=()=>tab(button.dataset.orgView));
 $('org-open-view').addEventListener('click',()=>action('Opening organisation planning…',refresh));
 $('org-refresh').onclick=()=>action('Refreshing complete organisation work…',refresh);
 $('org-open').onclick=()=>action('Opening the saved organisation plan…',()=>openPlan($('org-plan-select').value));
 $('org-new').onclick=()=>{form();history=[];issues=[];clear($('org-history'));renderIssues();organisationChoices(profile?.organisations.map(x=>x.key));tab('selection');status('New organisation plan. Select its actual fiscal calendar and source coverage.');};
 $('org-profile-open').onclick=()=>action('Reading complete organisation source coverage…',()=>openSource($('org-source').value));
 $('org-source').onchange=()=>{profile=null;drafts=[];detail=null;page=null;pageSelection=null;detailSelection=null;organisationChoices([]);clear($('org-profile'),'Read this source before changing the saved selection.');$('org-source-identity').textContent='';renderDrafts();};
 $('org-intake-file').onchange=()=>{if(!$('org-intake-label').value)$('org-intake-label').value=$('org-intake-file').files[0]?.name??'';};
 submit('org-intake-form','Retaining the complete organisation publisher XML…',async()=>{
  const file=$('org-intake-file').files[0];if(!file)throw new Error('Choose the complete organisation XML file.');
  const value=await(await request('/api/source',{method:'POST',headers:{'content-type':'application/xml','X-IATI-Name':encodeURIComponent(file.name),'X-IATI-Label':encodeURIComponent($('org-intake-label').value)},body:file})).json();
  await api.refreshWorkspace();form();await openSource(value.id);status('Complete organisation publisher source retained: '+value.bytes+' bytes.');
 });
 submit('org-plan-form','Saving the complete organisation planning revision…',save);
 $('org-save-corrections').onclick=()=>action('Saving and validating the complete corrected organisation edition…',save);
 submit('org-rows-form','Reading the complete source register…',()=>rows());
 $('org-rows-prev').onclick=()=>action('Reading the previous original register page…',()=>rows(Math.max(0,page.offset-50)));
 $('org-rows-next').onclick=()=>action('Reading the next original register page…',()=>rows(page.offset+page.rows.length));
 $('org-organisation-detail').onclick=()=>action('Opening the complete organisation record…',async()=>{
  const organisationKey=$('org-record-organisation').value||(profile?.organisations.length===1?profile.organisations[0].key:'');
  if(!organisationKey)throw new Error('Choose the organisation whose budget or document register needs a new element.');
  page=null;pageSelection=snapshot();await openDetail(organisationKey);
 });
 $('org-edit-target').onchange=()=>action('Reading the complete selected original field…',target);$('org-edit-operation').onchange=editOperation;
 submit('org-edit-form','Preparing the selected original correction…',async()=>draft());
 $('org-clear-edits').onclick=()=>{drafts=[];renderDrafts();};
 submit('org-review-form','Recording the named organisation review…',()=>send('review',change({decision:$('org-review-decision').value,actor:who(),note:$('org-review-note').value,
  acknowledgedIssueIds:[...$('org-review-issues').querySelectorAll('input:checked')].map(x=>x.value)})));
 submit('org-compare-form','Comparing complete saved organisation revisions…',async()=>{
  if(!plan)throw new Error('Open a saved plan.');
  const input={requestId:crypto.randomUUID(),before:{id:plan.id,revision:Number($('org-compare-before').value)},after:{id:plan.id,revision:Number($('org-compare-after').value)},actor:who()};
  if($('org-compare-pairs').value.trim())input.rowPairs=JSON.parse($('org-compare-pairs').value);
  await send('compare',input);
 });
 $('org-release').onclick=()=>action('Creating the complete reviewed organisation release…',()=>send('release',change({reviewId:plan.review.id,actor:who()})));
 $('org-export').onclick=()=>action('Preparing the complete organisation package…',()=>download(base+'export?'+q({id:plan.id,revision:$('org-delivery-revision').value}),'IATI_Organisation_Planning.zip'));
 const names={source:'original-organisations.xml',candidate:'candidate-organisations.xml',report:'organisation-planning.html',budgets:'organisation-budgets.csv',documents:'organisation-documents.csv'};
 for(const [kind,name]of Object.entries(names))$('org-file-'+kind).onclick=()=>action('Reading the complete saved '+kind+' file…',()=>download(base+'file?'+q({id:plan.id,revision:$('org-delivery-revision').value,kind}),name));
 submit('org-receive-form','Receiving the complete organisation planning history…',async()=>{
  const file=$('org-receive-file').files[0];if(!file)throw new Error('Choose the complete original package ZIP.');
  const result=await(await request(base+'receive',{method:'POST',headers:{'content-type':'application/zip'},body:file})).json();
  clear($('org-receive-result'));planningView($('org-receive-result'),result);await api.refreshWorkspace();
  const received=selectedPlan(result);if(received?.id)await openPlan(received.id,received.revision);
  tab('delivery');status('Complete organisation history received and reopened.');
 });
 $('org-retry').onclick=()=>action('Continuing the same saved organisation action…',()=>send(pending.route,pending.input));
 $('org-reconcile').onclick=()=>action('Reading the original saved action result…',async()=>{
  const r=await get(base+'request?'+q({requestId:pending.input.requestId}));
  if(r.state==='RECORDED'){if(r.input&&!same(r.input,pending.input))throw new Error('That saved request has a different original selection.');
   await storage('delete');pending=null;await api.refreshWorkspace();
   if(r.action==='compare'&&r.result)renderComparison(r.result);else if(r.plan)await openPlan(r.plan.id,r.plan.revision);
   status('The original action is saved and reopened.');
  }else status('This request is not yet recorded. Continue the same saved action.');
  buttons();
 });
 $('org-revise').onclick=()=>action('Retaining the rejected request and reopening its editable selection…',async()=>{
  if(!pending?.rejected)throw new Error('Reconcile or continue the original action first.');
  const r=await get(base+'request?'+q({requestId:pending.input.requestId}));
  if(r.state==='RECORDED')throw new Error('The original action is saved. Read its saved result before changing the selection.');
  await storage('archive',pending);await storage('delete');pending=null;buttons();status('The rejected action remains retained. Correct the selection and save a new request.');
 });
 tab(activeTab);buttons();
 return {refresh,buttons,openPlan,openSource,async newPlanFromSource(id){form();history=[];issues=[];clear($('org-history'));renderIssues();await openSource(id);tab('selection');},isOrganisationSource:id=>catalogue.sources.some(x=>x.id===id)};
};
