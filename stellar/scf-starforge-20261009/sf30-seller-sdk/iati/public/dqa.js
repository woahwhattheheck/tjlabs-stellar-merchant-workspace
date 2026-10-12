/* MIT. Native DQA customer workflow inside the original authenticated IATI console. */
'use strict';
window.IatiDqaUi=({get,post,request,action,status,download,metrics,table,properties,details,workspaceState})=>{
 const $=id=>document.getElementById(id),api='/api/iati/dqa/',short=v=>String(v??'').slice(0,12);
 let providers=[],assessments=[],cases=[],assessment=null,selectedCase=null,finding=null,comparison=null;
 let findingsOffset=0,findingsNext=null,comparisonOffset=0,comparisonNext=null,pending=null;
 try{pending=JSON.parse(sessionStorage.getItem('sf30.iati.dqa.pending')||'null');}catch{}
 const text=(tag,value,cls)=>{const el=document.createElement(tag);el.textContent=String(value??'');if(cls)el.className=cls;return el;};
 function view(name){document.querySelectorAll('[data-dqa-section]').forEach(el=>el.hidden=el.dataset.dqaSection!==name);
  document.querySelectorAll('[data-dqa-view]').forEach(el=>el.setAttribute('aria-selected',String(el.dataset.dqaView===name)));}
 document.querySelectorAll('[data-dqa-view]').forEach(el=>el.onclick=()=>view(el.dataset.dqaView));
 function choice(id,items,{blank=false,selected}={}){const select=$(id),old=selected??select.value;select.replaceChildren();
  if(blank)select.add(new Option('New provider',''));for(const row of items)select.add(new Option(row.label,row.id));
  select.value=items.some(row=>row.id===old)||blank&&old===''?old:items[0]?.id??'';}
 function decisions(){ $('dqa-retry').hidden=!pending;
  $('dqa-operation-status').textContent=pending?'Original request '+pending.input.requestId+' is retained. Reopen its exact result with Retry original request.':$('dqa-operation-status').dataset.completed||'';
  for(const id of ['dqa-response-download','dqa-request-download','dqa-before-download','dqa-after-download'])$(id).disabled=!assessment;
  $('dqa-findings-prev').disabled=!assessment||findingsOffset===0;$('dqa-findings-next').disabled=findingsNext===null;
  $('dqa-comparison-prev').disabled=!comparison||comparisonOffset===0;$('dqa-comparison-next').disabled=comparisonNext===null;
  $('dqa-case-export').disabled=!selectedCase;$('dqa-review-remove').disabled=!selectedCase||!finding;
 }
 function savePending(value){sessionStorage.setItem('sf30.iati.dqa.pending',JSON.stringify(value));pending=value;decisions();}
 async function execute(route,input){
  if(pending)throw new Error('Retry the retained DQA request '+pending.input.requestId+' before starting its next saved operation.');
  savePending({route,input});const result=await post(api+route,input);
  sessionStorage.setItem('sf30.iati.dqa.last-result',JSON.stringify({route,requestId:input.requestId,result:{id:result.id,revision:result.revision,schema:result.schema}}));
  sessionStorage.removeItem('sf30.iati.dqa.pending');pending=null;
  $('dqa-operation-status').dataset.completed='Saved request '+input.requestId+' · '+(result.id??'received');
  decisions();return result;
 }
 const requestId=kind=>'dqa-'+kind+'-'+crypto.randomUUID();
 function list(holder,items,open,empty){holder.replaceChildren();if(!items.length){holder.append(text('p',empty,'fine'));return;}
  for(const item of items){const row=text('div','','dqa-entry'),copy=text('div','');
   copy.append(text('strong',item.title),text('p',item.description,'fine'),text('code',item.id));
   const button=text('button','Open');button.type='button';button.onclick=()=>action('Opening saved DQA work…',()=>open(item.id));
   row.append(copy,button);holder.append(row);}
 }
 function selections(id,items,chosen){const keep=new Set(chosen??[...$(id).querySelectorAll('input:checked')].map(el=>el.value));$(id).replaceChildren();
  for(const item of items){const label=text('label','','dqa-choice'),box=document.createElement('input');box.type='checkbox';box.value=item.id;box.checked=keep.has(item.id);
   const name=text('span',item.label);name.append(text('small',item.detail??item.id));label.append(box,name);$(id).append(label);}
  if(!items.length)$(id).append(text('p','No retained editions available.','fine'));
 }
 const selectedValues=id=>[...$(id).querySelectorAll('input:checked')].map(el=>el.value);
 function assessmentLabel(row){return row.label+' · '+row.summary.organisation+' · '+row.generatedAt;}
 function fillSelections(caseValue){
  selections('dqa-case-assessments',assessments.map(row=>({id:row.id,label:assessmentLabel(row),detail:row.id})),caseValue?.assessmentIds);
  const portfolios=workspaceState().portfolios??[],selected=caseValue?.portfolios??selectedCase?.portfolios;
  const selectedMap=new Map(portfolios.map(row=>[row.id+':'+row.revision,{id:row.id+':'+row.revision,label:row.name+' · revision '+row.revision,detail:row.id}]));
  for(const row of selected??[]){const key=row.id+':'+row.revision;if(!selectedMap.has(key))selectedMap.set(key,{id:key,label:'Retained portfolio · revision '+row.revision,detail:row.id});}
  selections('dqa-case-portfolios',[...selectedMap.values()],caseValue?.portfolios?.map(row=>row.id+':'+row.revision));
 }
 async function refresh(){
  const values=await Promise.all([get(api+'providers'),get(api+'assessments'),get(api+'cases')]);
  providers=values[0].providers;assessments=values[1].assessments;cases=values[2].cases;
  metrics($('dqa-counts'),[['Provider editions',providers.length],['Native assessments',assessments.length],['Customer cases',cases.length]]);
  const ps=providers.map(row=>({id:row.id,label:row.name+' · '+short(row.id)}));
  choice('dqa-capture-provider',ps);choice('dqa-provider-previous',ps,{blank:true});
  const ass=assessments.map(row=>({id:row.id,label:assessmentLabel(row)}));
  choice('dqa-compare-before',ass);choice('dqa-compare-after',ass);
  list($('dqa-providers'),providers.map(row=>({id:row.id,title:row.name,description:row.endpoint+' · '+row.timeoutSeconds+' seconds'})),openProvider,'Save the provider edition used for your assessment.');
  list($('dqa-assessments'),assessments.map(row=>({id:row.id,title:row.label,description:row.summary.organisation+' · '+row.counts.fail_count+' failed activities · '+row.generatedAt})),openAssessment,'Capture the first native assessment from your selected provider.');
  list($('dqa-cases'),cases.map(row=>({id:row.id,title:row.name,description:row.client+' · revision '+row.revision+' · '+row.review.status})),openCase,'Create a named customer case from retained assessments.');
  fillSelections();decisions();
 }
 async function openProvider(id){const row=providers.find(value=>value.id===id);if(!row)throw new Error('Refresh the provider list.');
  $('dqa-provider-name').value=row.name;$('dqa-provider-endpoint').value=row.endpoint;$('dqa-provider-env').value=row.authorizationEnv;
  $('dqa-provider-timeout').value=row.timeoutSeconds;$('dqa-provider-notes').value=row.notes;$('dqa-provider-previous').value=row.id;view('provider');}
 async function openAssessment(id){
  assessment=await get(api+'assessment?'+new URLSearchParams({id}));findingsOffset=0;finding=null;
  const holder=$('dqa-assessment-detail');holder.replaceChildren();
  holder.append(text('h3',assessment.label));properties(holder,{assessment:assessment.id,provider:assessment.provider,organisation:assessment.summary.organisation,
   generatedAt:assessment.generatedAt,receivedAt:assessment.receivedAt,operator:assessment.operator,financialYear:assessment.summary.financial_year,
   providerBudget:assessment.summary.total_budget,configurationStable:assessment.configurationStable,detailsSelected:assessment.detailsSelected});
  const counts=text('div','','metrics');holder.append(counts);metrics(counts,[['Programmes',assessment.summary.total_programmes],['Projects',assessment.summary.total_projects],
   ['Passed activities',assessment.counts.pass_count],['Failed activities',assessment.counts.fail_count],['Not-applicable rule results',assessment.counts.not_applicable_count]]);
  for(const note of assessment.reviewFindings)holder.append(text('p',note,'fine'));
  details(holder,'Native percentages and coverage', {percentages:assessment.percentages,availableSegmentations:assessment.availableSegmentations});
  details(holder,'Complete original request selection',assessment.parameters);
  details(holder,'Original provider configuration observations',{before:assessment.configurationBefore,after:assessment.configurationAfter});
  await readFindings(0);view('assess');decisions();
 }
 function rowTable(holder,columns,rows,onOpen){
  holder.replaceChildren();const wrapper=text('div','','table-scroll'),t=document.createElement('table'),thead=document.createElement('thead'),head=document.createElement('tr');
  for(const column of columns)head.append(text('th',column.label));if(onOpen)head.append(text('th','Review'));thead.append(head);t.append(thead);
  const body=document.createElement('tbody');for(const row of rows){const tr=document.createElement('tr');for(const col of columns)tr.append(text('td',row[col.key]));
   if(onOpen){const td=document.createElement('td'),button=text('button','Open finding');button.type='button';button.onclick=()=>onOpen(row);td.append(button);tr.append(td);}body.append(tr);}
  if(!rows.length){const tr=document.createElement('tr'),td=text('td','No matching records in the complete selected results.');td.colSpan=columns.length+(onOpen?1:0);tr.append(td);body.append(tr);}
  t.append(body);wrapper.append(t);holder.append(wrapper);
 }
 async function readFindings(offset){
  if(!assessment)throw new Error('Open a native assessment first.');
  const value=await get(api+'findings?'+new URLSearchParams({id:assessment.id,offset,limit:50,status:$('dqa-findings-status').value,search:$('dqa-findings-search').value}));
  findingsOffset=value.offset;findingsNext=value.nextOffset;
  $('dqa-findings-page').textContent=value.total?(value.offset+1)+'–'+Math.min(value.total,value.offset+value.items.length)+' of '+value.total+' original rule results':'No selected rule results.';
  rowTable($('dqa-findings'),[{key:'iatiIdentifier',label:'Activity'},{key:'hierarchy',label:'Hierarchy'},{key:'rule',label:'Native rule'},{key:'status',label:'Result'}],value.items,openFinding);
  decisions();
 }
 function openFinding(row){finding={assessment:assessment.id,...row};const holder=$('dqa-finding-detail');holder.replaceChildren();
  const box=text('div','','dqa-finding');box.append(text('h3',row.iatiIdentifier+' · '+row.rule));properties(box,{finding:row.key,result:row.status,title:row.title});
  details(box,'Complete original native rule result',row.native);const button=text('button','Review this finding in the selected case');button.type='button';button.onclick=()=>{view('case');$('dqa-review-form').scrollIntoView({block:'center'});};
  box.append(button);holder.append(box);
  const previous=selectedCase?.actions.find(item=>item.assessment===finding.assessment&&item.finding===row.key);
  $('dqa-review-selection').textContent=row.iatiIdentifier+' · '+row.rule+' · assessment '+short(finding.assessment);
  $('dqa-review-status').value=previous?.status??'open';$('dqa-review-owner').value=previous?.owner??'';
  $('dqa-review-due').value=previous?.dueDate??'';$('dqa-review-note').value=previous?.note??'';decisions();
 }
 function caseInput(edits=[]){
  const result={requestId:requestId('case'),name:$('dqa-case-name').value,client:$('dqa-case-client').value,notes:$('dqa-case-notes').value,
   assessmentIds:selectedValues('dqa-case-assessments'),portfolios:selectedValues('dqa-case-portfolios').map(value=>{const [id,revision]=value.split(':');return{id,revision:Number(revision)};}),
   review:{status:$('dqa-case-status').value,reviewer:$('dqa-case-reviewer').value,note:$('dqa-case-note').value},reviewEdits:edits};
  if(selectedCase)Object.assign(result,{id:selectedCase.id,expectedRevision:selectedCase.revision});return result;
 }
 async function openCase(id,revision){
  const query=new URLSearchParams({id});if(revision!==undefined)query.set('revision',revision);
  selectedCase=await get(api+'case?'+query);
  $('dqa-case-name').value=selectedCase.name;$('dqa-case-client').value=selectedCase.client;$('dqa-case-notes').value=selectedCase.notes;
  $('dqa-case-status').value=selectedCase.review.status;$('dqa-case-reviewer').value=selectedCase.review.reviewer;$('dqa-case-note').value=selectedCase.review.note;
  $('dqa-case-edition').textContent='Saved case '+selectedCase.id+' · revision '+selectedCase.revision;fillSelections(selectedCase);
  const holder=$('dqa-case-detail');holder.replaceChildren();properties(holder,{name:selectedCase.name,client:selectedCase.client,id:selectedCase.id,revision:selectedCase.revision,
   assessmentEditions:selectedCase.assessmentIds.length,financePortfolios:selectedCase.portfolios.length,review:selectedCase.review.status,reviewer:selectedCase.review.reviewer,updatedAt:selectedCase.updatedAt});
  details(holder,'Complete saved case revision',selectedCase);
  const history=await get(api+'history?'+new URLSearchParams({case:id}));
  list($('dqa-case-history'),history.history.map(row=>({id:String(row.revision),title:'Revision '+row.revision,description:row.updatedAt+' · '+row.review.status})),
   rev=>openCase(id,Number(rev)),'No saved revisions.');
  rowTable($('dqa-actions'),[{key:'assessment',label:'Assessment'},{key:'finding',label:'Finding'},{key:'status',label:'Decision'},{key:'owner',label:'Owner'},{key:'dueDate',label:'Due date'},{key:'note',label:'Decision note'}],selectedCase.actions);
  view('case');decisions();
 }
 async function saveCase(edits=[]){const result=await execute('case',caseInput(edits));selectedCase=result;await refresh();await openCase(result.id,result.revision);
  status('Customer case revision '+result.revision+' saved with complete original assessments and review decisions.');}
 function newCase(){selectedCase=null;$('dqa-case-form').reset();$('dqa-case-edition').textContent='New customer case.';
  fillSelections({assessmentIds:assessment?[assessment.id]:[],portfolios:[]});$('dqa-case-detail').replaceChildren();$('dqa-case-history').replaceChildren();$('dqa-actions').replaceChildren();view('case');decisions();}
 async function readComparison(id,offset=0){
  comparison=await get(api+'comparison?'+new URLSearchParams({id,offset,limit:50}));comparisonOffset=comparison.page.offset;comparisonNext=comparison.page.nextOffset;
  const holder=$('dqa-comparison-detail');holder.replaceChildren();properties(holder,{comparison:comparison.id,before:comparison.before,after:comparison.after,providerChanged:comparison.providerChanged,
   configurationChanged:comparison.configurationChanged,beforeGeneratedAt:comparison.beforeGeneratedAt,afterGeneratedAt:comparison.afterGeneratedAt});
  const counts=text('div','','metrics');holder.append(counts);metrics(counts,Object.entries(comparison.counts));
  details(holder,'Original assessment totals and selection changes',{before:comparison.beforeSummary,after:comparison.afterSummary,beforeCounts:comparison.beforeCounts,afterCounts:comparison.afterCounts,scopeChanges:comparison.scopeChanges});
  holder.append(text('p',comparison.meaning,'fine'));const changes=$('dqa-comparison-changes');changes.replaceChildren();
  for(const row of comparison.page.items){const box=text('div','','dqa-finding');box.append(text('h3',(row.after?.iati_identifier??row.before?.iati_identifier)+' · '+row.kind));
   details(box,'Complete original before and after activity',{before:row.before,after:row.after});changes.append(box);}
  const p=comparison.page;$('dqa-comparison-page').textContent=p.total?(p.offset+1)+'–'+Math.min(p.total,p.offset+p.items.length)+' of '+p.total+' complete activity changes':'No activity record changes in these returned lists.';
  view('compare');decisions();
 }
 function submit(id,message,run){$(id).addEventListener('submit',event=>{event.preventDefault();action(message,run);});}
 submit('dqa-provider-form','Saving the selected native provider edition…',async()=>{
  const value={requestId:requestId('provider'),name:$('dqa-provider-name').value,endpoint:$('dqa-provider-endpoint').value,
   authorizationEnv:$('dqa-provider-env').value,timeoutSeconds:Number($('dqa-provider-timeout').value),notes:$('dqa-provider-notes').value};
  if($('dqa-provider-previous').value)value.previous=$('dqa-provider-previous').value;
  const result=await execute('provider',value);await refresh();$('dqa-capture-provider').value=result.id;view('assess');status('Native provider edition saved.');});
 submit('dqa-capture-form','Capturing the full native DQA assessment and configuration…',async()=>{
  const lines=id=>$(id).value.split(/\r?\n/).map(value=>value.trim()).filter(Boolean),organisations=lines('dqa-organisation');
  if(!organisations.length)throw new Error('Select at least one original organisation identifier.');
  const parameters={organisation:organisations.length===1?organisations[0]:organisations,
   segmentation:{countries:lines('dqa-countries'),regions:lines('dqa-regions'),sectors:lines('dqa-sectors')},
   require_funding_and_accountable:$('dqa-require-funding').checked,include_exemptions:$('dqa-include-exemptions').checked,
   optional_rules:{check_acronyms:$('dqa-check-acronyms').checked},skip_cache:$('dqa-skip-cache').checked,
   failed_activities:$('dqa-failed-activities').checked,use_budget_date_filter:$('dqa-budget-filter').checked};
  const result=await execute('capture',{requestId:requestId('capture'),provider:$('dqa-capture-provider').value,parameters,
   label:$('dqa-capture-label').value,operator:$('dqa-operator').value,notes:$('dqa-capture-notes').value});
  await refresh();await openAssessment(result.id);status('Native DQA assessment captured with its full request, response and provider observations.');});
 submit('dqa-findings-form','Reading the selected original finding results…',()=>readFindings(0));
 submit('dqa-case-form','Saving the complete selected customer case…',()=>saveCase());
 submit('dqa-review-form','Saving the named finding decision…',async()=>{
  if(!selectedCase||!finding)throw new Error('Open a saved case and an original finding first.');
  await saveCase([{assessment:finding.assessment,finding:finding.key,status:$('dqa-review-status').value,owner:$('dqa-review-owner').value,dueDate:$('dqa-review-due').value,note:$('dqa-review-note').value}]);});
 $('dqa-review-remove').onclick=()=>action('Saving removal of the selected review decision…',async()=>{
  if(!selectedCase||!finding)throw new Error('Select the original case and finding.');await saveCase([{assessment:finding.assessment,finding:finding.key,remove:true}]);});
 submit('dqa-comparison-form','Comparing the complete original native responses…',async()=>{const value=await post(api+'compare',{before:$('dqa-compare-before').value,after:$('dqa-compare-after').value});await readComparison(value.id);status('Full native assessment comparison saved.');});
 submit('dqa-receive-form','Receiving and reopening the complete original customer case…',async()=>{
  const file=$('dqa-receive-file').files[0];if(!file)throw new Error('Choose a complete DQA customer ZIP.');
  const result=await(await request(api+'receive',{method:'POST',headers:{'content-type':'application/zip'},body:file})).json();
  const holder=$('dqa-receive-result');holder.replaceChildren();properties(holder,result.receiving);
  await refresh();await openCase(result.case.id,result.case.revision);status('Complete customer case received and reopened.');});
 $('dqa-new-case').onclick=newCase;
 $('dqa-findings-prev').onclick=()=>action('Opening the previous original findings…',()=>readFindings(Math.max(0,findingsOffset-50)));
 $('dqa-findings-next').onclick=()=>action('Opening the next original findings…',()=>readFindings(findingsNext));
 $('dqa-comparison-prev').onclick=()=>action('Opening previous complete activity changes…',()=>readComparison(comparison.id,Math.max(0,comparisonOffset-50)));
 $('dqa-comparison-next').onclick=()=>action('Opening next complete activity changes…',()=>readComparison(comparison.id,comparisonNext));
 for(const [id,kind]of [['dqa-response-download','response'],['dqa-request-download','request'],['dqa-before-download','configuration-before'],['dqa-after-download','configuration-after']])
  $(id).onclick=()=>action('Downloading the complete original '+kind+'…',()=>{if(!assessment)throw new Error('Open an assessment first.');return download(api+'file?'+new URLSearchParams({assessment:assessment.id,kind}),'dqa-'+kind+'.json');});
 $('dqa-case-export').onclick=()=>action('Exporting the complete customer package and original history…',()=>{
  if(!selectedCase)throw new Error('Open a saved case first.');return download(api+'export?'+new URLSearchParams({case:selectedCase.id,revision:selectedCase.revision}),'iati-dqa-customer-r'+selectedCase.revision+'.zip');});
 $('dqa-retry').onclick=()=>action('Reopening the result of the retained original DQA request…',async()=>{
  if(!pending)return;const original=pending,result=await post(api+original.route,original.input);
  sessionStorage.setItem('sf30.iati.dqa.last-result',JSON.stringify({route:original.route,requestId:original.input.requestId,result:{id:result.id,revision:result.revision,schema:result.schema}}));
  sessionStorage.removeItem('sf30.iati.dqa.pending');pending=null;$('dqa-operation-status').dataset.completed='Saved original request '+original.input.requestId;
  await refresh();if(original.route==='capture')await openAssessment(result.id);else if(original.route==='case')await openCase(result.id,result.revision);decisions();status('The original DQA request result is open.');});
 $('dqa-open').addEventListener('click',()=>action('Opening retained DQA assessments and customer cases…',refresh));
 view('assess');decisions();return {refresh,openAssessment,openCase,buttons:decisions};
};
