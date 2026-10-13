// SPDX-License-Identifier: MIT
const $=id=>document.getElementById(id);
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=v=>v===null||v===undefined?'—':Number(v).toLocaleString('en',{maximumFractionDigits:3});
const measures={pm25:['PM2.5','µg/m³'],pm10:['PM10','µg/m³'],atmp:['Temperature','°C'],rhum:['Relative humidity','%'],rco2:['CO₂','ppm']};
let state,loadedProjectId,review,receiveReview,sourceReview,receivedSelection,definitionBase64,cataloguePage=0,poll;
let receivingGeneration=0,sourceGeneration=0,reportReviewGeneration=0,receiveCommitPending=false,receivingSelectionLoaded=false;
function notice(message,error=false){$('notice').textContent=message;$('notice').dataset.error=String(error);}
async function request(path,body,raw=false){
 const response=await fetch(path,{...(body!==undefined?{method:'POST',headers:{'content-type':raw?'application/octet-stream':'application/json'},body:raw?body:JSON.stringify(body)}:{}),credentials:'same-origin'});
 const data=await response.json();if(!response.ok)throw new Error(data.code??'REQUEST_FAILED');return data;
}
const action=fn=>async()=>{try{notice('');await fn();}catch(e){notice(e.message,true);}};
function options(id,items,label,empty){
 const element=$(id),previous=element.value;element.innerHTML=(empty!==undefined?'<option value="">'+escape(empty)+'</option>':'')+items.map(v=>'<option value="'+escape(v.id)+'">'+escape(label(v))+'</option>').join('');
 if([...element.options].some(v=>v.value===previous))element.value=previous;
}
function configureLocationTypes(){
 const dashboard=state?.connections.find(v=>v.id===$('connection').value)?.kind==='dashboard';
 for(const field of $('locations').querySelectorAll('[data-field=sourceType]')){
  const previous=field.value;field.innerHTML=dashboard?'<option value="dashboard">Dashboard</option>':'<option value="outdoor">Outdoor Map</option><option value="indoor">Indoor Map</option>';
  field.value=dashboard?'dashboard':previous==='indoor'?'indoor':'outdoor';field.disabled=dashboard;
 }
}
function locationRow(value={id:'',sourceType:'outdoor',label:'',timezone:'UTC'}){
 const row=document.createElement('tr');row.innerHTML='<td><select aria-label="Location source" data-field="sourceType"><option value="outdoor">Outdoor Map</option><option value="indoor">Indoor Map</option><option value="dashboard">Dashboard</option></select></td><td><input aria-label="Location ID" data-field="id" value="'+escape(value.id)+'"></td><td><input aria-label="Customer location label" data-field="label" value="'+escape(value.label)+'"></td><td><input aria-label="Display timezone" data-field="timezone" value="'+escape(value.timezone)+'"></td><td><button type="button" class="small">Remove</button></td>';
 row.querySelector('[data-field=sourceType]').value=value.sourceType??'outdoor';row.querySelector('button').onclick=()=>row.remove();$('locations').append(row);configureLocationTypes();
}
function locationValues(){return [...$('locations').rows].map(row=>Object.fromEntries([...row.querySelectorAll('input,select')].map(x=>[x.dataset.field,x.value])));}
function projectForm(record){
 const v=record?.value??{organisation:'',title:'Air quality operating report',owner:'',connectionId:'map-public',locations:[],measures:['pm25','atmp','rhum','rco2'],bucket:'1h',minimumCoverage:.9,thresholds:{},notes:''};
 for(const id of ['organisation','title','owner','notes'])$(id).value=v[id];$('connection').value=v.connectionId;$('bucket').value=v.bucket;$('coverage').value=v.minimumCoverage*100;
 $('locations').replaceChildren();for(const location of v.locations)locationRow(location);if(!v.locations.length)locationRow();
 $('measures').innerHTML=Object.entries(measures).map(([key,[label]])=>'<label class="check"><input type="checkbox" value="'+key+'" '+(v.measures.includes(key)?'checked':'')+'>'+escape(label)+'</label>').join('');
 $('thresholds').innerHTML=Object.entries(measures).map(([key,[label,unit]])=>{const rule=v.thresholds[key];return '<div class="grid" data-measure="'+key+'"><label class="check"><input data-field="enabled" type="checkbox" '+(rule?'checked':'')+'>'+escape(label)+'</label><label>Operator<select data-field="operator"><option value="gte" '+(rule?.operator!=='lte'?'selected':'')+'>≥</option><option value="lte" '+(rule?.operator==='lte'?'selected':'')+'>≤</option></select></label><label>'+escape(unit)+'<input data-field="value" type="number" step="any" value="'+escape(rule?.value??'')+'"></label><label>Operating purpose<input data-field="purpose" value="'+escape(rule?.purpose??'')+'"></label></div>';}).join('');
 loadedProjectId=record?.id??null;$('project-state').textContent=record?'Saved revision · '+record.createdAt:'Create this customer project.';
}
function readProject(){
 const thresholds={};for(const row of $('thresholds').children)if(row.querySelector('[data-field=enabled]').checked)thresholds[row.dataset.measure]={operator:row.querySelector('[data-field=operator]').value,value:row.querySelector('[data-field=value]').value.trim()===''?null:Number(row.querySelector('[data-field=value]').value),purpose:row.querySelector('[data-field=purpose]').value};
 return {organisation:$('organisation').value,title:$('title').value,owner:$('owner').value,connectionId:$('connection').value,locations:locationValues(),
  measures:[...$('measures').querySelectorAll('input:checked')].map(x=>x.value),bucket:$('bucket').value,minimumCoverage:Number($('coverage').value)/100,thresholds,notes:$('notes').value};
}
function rowTable(rows){
 return '<div class="tablewrap"><table><thead><tr><th>Location</th><th>Measure</th><th>Mean</th><th>Minimum / maximum</th><th>Available / expected</th><th>Populated bins</th><th>Readiness</th><th>Prior / change</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+escape(r.label)+'<br><small>'+escape(r.sourceType+' · '+r.locationId)+'</small></td><td>'+escape(r.measurementLabel)+'<br><small>'+escape(r.unit)+'</small></td><td>'+number(r.mean)+'</td><td>'+number(r.minimum)+' / '+number(r.maximum)+'</td><td>'+r.availableBuckets+' / '+r.expectedBuckets+'</td><td>'+number(r.coverage*100)+'%</td><td>'+escape(r.status.replaceAll('_',' '))+'</td><td>'+(r.comparison?number(r.comparison.baselineMean)+' / '+number(r.comparison.meanChange):'—')+'</td></tr>').join('')+'</tbody></table></div>';
}
function renderPlan(){
 const plan=state.plans.find(x=>x.id===$('plan').value);$('tasks').innerHTML=plan?'<table><thead><tr><th>Selection</th><th>State</th><th>Latest response</th></tr></thead><tbody>'+plan.tasks.map(t=>'<tr><td>'+escape(t.task_key)+'</td><td>'+escape(t.status)+'</td><td>'+escape(t.error??'')+'</td></tr>').join('')+'</tbody></table>':'';
 const active=state.active;$('acquisition-state').textContent=active?'Acquiring · '+active.results.length+' request results retained · started '+active.startedAt:plan?plan.tasks.filter(x=>x.status==='COMPLETE').length+' / '+plan.tasks.length+' selections complete':'Save a project and reporting period to begin.';
 $('acquire').disabled=Boolean(active)||!plan||Boolean(plan.sourceSetId);$('stop').disabled=!active;$('reprocess').disabled=Boolean(active)||!plan;$('review').disabled=!plan;
}
function renderSource(){
 const source=state.sourceSets?.find(v=>v.id===$('source-set').value);
 $('source-use').disabled=!source;$('source-window-use').disabled=!source;
 options('source-window',source?.reportWindows??[],v=>v.id+' · '+v.start.slice(0,10)+' → '+v.end.slice(0,10),'Select a period');
 $('source-detail').innerHTML=source?'<p>'+escape(source.operationId)+' · '+source.locations.length+' locations · '+source.files+' original files</p><p>Retained request overlap: '+escape(source.range.start)+' → '+escape(source.range.end)+' · '+escape(source.range.bucket)+'. Measures available across this selection: '+source.commonMeasures.map(m=>escape(measures[m][0])).join(', ')+'.</p><details><summary>Locations and available history</summary><div class="tablewrap"><table><thead><tr><th>Source / location</th><th>Customer label</th><th>Available history</th></tr></thead><tbody>'+source.locations.map(v=>'<tr><td>'+escape(v.sourceType+' · '+v.id)+'</td><td>'+escape(v.label)+'</td><td>'+v.measures.map(m=>escape(measures[m][0])).join(', ')+'</td></tr>').join('')+'</tbody></table></div></details>':'<p class="hint">This plan will acquire original provider responses for the selected reporting period.</p>';
}
function renderReport(){
 const report=state.reports.find(x=>x.id===$('report').value);$('report-detail').innerHTML=report?'<p>'+escape(report.period.start)+' → '+escape(report.period.end)+' · '+escape(report.period.bucket)+'</p>'+rowTable(report.rows):'';
 $('downloads').innerHTML=report?[['html','Report HTML'],['summary','Summary CSV'],['series','Full series CSV'],['json','Report JSON'],['handover','Editable JSON'],['zip','Complete ZIP']].map(([format,label])=>'<a class="button" href="/api/report?id='+encodeURIComponent(report.id)+'&format='+format+'">'+label+'</a>').join(''):'';
 $('deliver').disabled=!report;
}
function renderReceivingSelection(preferredId){
 const receipts=state.receiving.filter(v=>v.workspaceId===state.workspaceId&&state.reports.some(r=>r.id===v.reportId&&r.sha256===v.reportSha256&&r.projectId===v.projectId)).sort((a,b)=>b.receivedAt.localeCompare(a.receivedAt)||a.id.localeCompare(b.id));
 const previous=$('received-selection').value;
 options('received-selection',receipts,v=>{const report=state.reports.find(r=>r.id===v.reportId);return report.title+' · '+report.period.start.slice(0,10)+' → '+report.period.end.slice(0,10)+' · received '+v.receivedAt;},'Choose a received study');
 if(preferredId!==undefined)$('received-selection').value=receipts.some(v=>v.id===preferredId)?preferredId:'';
 else if(!receivingSelectionLoaded&&!previous&&receipts.length)$('received-selection').value=(receipts.find(v=>v.projectId===state.currentProject?.id)??receipts[0]).id;
 receivingSelectionLoaded=true;
 const receipt=receipts.find(v=>v.id===$('received-selection').value),report=receipt?state.reports.find(v=>v.id===receipt.reportId):null,project=receipt?state.projects.find(v=>v.id===receipt.projectId):null;
 receivedSelection=receipt?Object.freeze({receivingId:receipt.id,projectId:receipt.projectId,reportId:receipt.reportId,reportSha256:receipt.reportSha256,packageId:receipt.packageId,packageSha256:receipt.packageSha256}):null;
 $('receive-select').disabled=!receivedSelection;$('received-detail').textContent=receipt?project.value.organisation+' · '+report.title+' · '+report.period.start+' → '+report.period.end:'Receive a complete study to continue its saved project and prior edition.';
}
async function refresh(force=false){
 state=await request('/api/state');$('workspace-id').textContent=state.workspaceId;
 options('connection',state.connections,v=>v.title+(v.kind==='dashboard'?(v.binding.tokenAvailable?' · host token available':' · host token required'):''));
 if(force||loadedProjectId===undefined||loadedProjectId!==(state.currentProject?.id??null))projectForm(state.currentProject);
 options('plan',[...state.plans].reverse(),v=>v.title+' · '+v.period.start.slice(0,10)+' → '+v.period.end.slice(0,10));
 options('report',[...state.reports].reverse(),v=>v.title+' · '+v.period.start.slice(0,10)+' → '+v.period.end.slice(0,10));
 options('source-set',state.sourceSets??[],v=>v.operationId+' · '+v.locations.length+' locations','New provider acquisition');
 options('baseline',[...state.reports].reverse(),v=>v.title+' · '+v.period.start.slice(0,10)+' → '+v.period.end.slice(0,10),'First edition');
 renderSource();renderPlan();renderReport();renderReceivingSelection();clearTimeout(poll);if(state.active)poll=setTimeout(()=>refresh().catch(e=>notice(e.message,true)),2000);
}
$('add-location').onclick=()=>{if($('locations').rows.length>=20){notice('This customer project already contains twenty locations.',true);return;}locationRow();};
$('refresh').onclick=action(()=>refresh());
$('connection').onchange=configureLocationTypes;
$('save-project').onclick=action(async()=>{const result=await request('/api/project',{project:readProject(),expectedCurrent:loadedProjectId??null});await refresh();notice('Customer project revision saved.');});
$('create-plan').onclick=action(async()=>{
 if(!state.currentProject)throw new Error('Save the customer project first.');
 const result=await request('/api/plan',{expectedProjectId:state.currentProject.id,title:$('title').value,period:{start:new Date($('start').value+'Z').toISOString(),end:new Date($('end').value+'Z').toISOString()},baselineReportId:$('baseline').value||null,sourceSetId:$('source-set').value||null,notes:$('notes').value});
 await refresh();$('plan').value=result.id;renderPlan();review=null;reportReviewGeneration++;$('commit').disabled=true;notice(result.sourceSetId?'Retained source selected for this period. Review the complete report.':'Acquisition plan saved with the selected project revision, source connection and UTC period.');
});
$('plan').onchange=()=>{reportReviewGeneration++;review=null;$('commit').disabled=true;$('report-review').replaceChildren();renderPlan();};
$('acquire').onclick=action(async()=>{await request('/api/acquire',{planId:$('plan').value,retryFailed:$('retry').checked});await refresh();});
$('stop').onclick=action(async()=>{await request('/api/acquire/stop',{});await refresh();});
$('reprocess').onclick=action(async()=>{const result=await request('/api/acquire/reprocess',{planId:$('plan').value});await refresh();notice(result.results.length+' saved response selections reopened.');});
$('review').onclick=action(async()=>{
 const planId=$('plan').value,generation=++reportReviewGeneration;review=null;$('commit').disabled=true;
 const inspected=await request('/api/review',{planId});if(generation!==reportReviewGeneration||$('plan').value!==planId)return;review=inspected;$('report-review').innerHTML='<h3>'+escape(review.title)+'</h3><p>'+escape(review.period.start)+' → '+escape(review.period.end)+'</p>'+rowTable(review.rows)+'<p class="hint">'+escape(review.interpretation)+'</p>'+
  (review.issues.length?'<p>'+review.issues.length+' acquisition selections remain incomplete. Their states are retained in this edition.</p><ul>'+review.issues.map(x=>'<li>'+escape(x.task)+' · '+escape(x.status)+' · '+escape(x.code)+'</li>').join('')+'</ul>':'')+'<p>'+review.sources.length+' original responses · '+review.seriesRows+' retained measurements</p>';
 $('commit').disabled=false;
});
$('commit').onclick=action(async()=>{
 if(!review)throw new Error('Review the selected report first.');const report=await request('/api/commit',{planId:review.planId,expectedReviewSha:review.reviewSha256});
 await refresh();$('report').value=report.id;renderReport();$('commit').disabled=true;notice('Customer edition committed. The complete report and editable package are ready.');
});
$('report').onchange=renderReport;
$('deliver').onclick=action(async()=>{const result=await request('/api/deliver',{reportId:$('report').value,directory:$('destination').value});$('delivery-state').textContent=result.files.length+' files delivered to '+result.directory;notice('Complete customer package delivered.');});
async function catalogue(page){
 const result=await request('/api/catalogue?page='+page+'&sourceType='+$('catalogue-type').value);cataloguePage=result.page;$('catalogue-state').textContent=result.sourceType+' · page '+result.page+' · '+result.returned+' returned locations';$('catalogue-next').disabled=!result.hasNext;
 $('catalogue').innerHTML='<table><thead><tr><th>Location</th><th>Provider / contributor</th><th>Timezone</th><th></th></tr></thead><tbody>'+result.locations.map((v,i)=>'<tr><td>'+escape(v.locationName??('Indoor '+v.locationId))+'<br><small>'+escape(v.locationId)+'</small></td><td>'+escape(v.provider)+'<br>'+escape(v.ownerName)+'</td><td>'+escape(v.timezone??'Customer setting')+'</td><td><button class="small" data-index="'+i+'">Use location</button></td></tr>').join('')+'</tbody></table>';
 for(const button of $('catalogue').querySelectorAll('button'))button.onclick=()=>{const v=result.locations[Number(button.dataset.index)],existing=locationValues();
  if(state.connections.find(v=>v.id===$('connection').value)?.kind!=='map-public'){notice('Choose the Public Map connection before adding a public location.',true);return;}
  if(existing.some(x=>x.sourceType===result.sourceType&&x.id===String(v.locationId))){notice('This location is already selected.');return;}
  if(existing.length===1&&!existing[0].id)$('locations').replaceChildren();
  if($('locations').rows.length>=20){notice('This project already contains twenty locations.',true);return;}
  locationRow({id:String(v.locationId),sourceType:result.sourceType,label:v.locationName??('Indoor '+v.locationId),timezone:v.timezone??'UTC'});
 };
}
$('catalogue-type').onchange=()=>{$('catalogue').replaceChildren();$('catalogue-next').disabled=true;cataloguePage=0;$('catalogue-state').textContent='Read the selected source page.';};
$('catalogue-first').onclick=action(()=>catalogue(1));$('catalogue-next').onclick=action(()=>catalogue(cataloguePage+1));
$('source-file').onchange=()=>{sourceGeneration++;sourceReview=null;$('source-import').disabled=true;$('source-review-detail').replaceChildren();};
$('source-review').onclick=action(async()=>{
 const generation=++sourceGeneration,file=$('source-file').files[0];sourceReview=null;$('source-import').disabled=true;if(!file)throw new Error('Select the complete original source packet.');
 const inspected=await request('/api/source/review',file,true);if(generation!==sourceGeneration||$('source-file').files[0]!==file)return;sourceReview={...inspected,file,generation};$('source-review-detail').textContent=sourceReview.operationId+' · '+sourceReview.files+' complete files · '+sourceReview.locations.length+' locations · '+number(sourceReview.sourceBytes)+' original source bytes';$('source-import').disabled=false;
});
$('source-import').onclick=action(async()=>{
 const reviewed=sourceReview;if(!reviewed||reviewed.generation!==sourceGeneration||reviewed.file!==$('source-file').files[0])throw new Error('Review this source collection first.');
 const selected=await request('/api/source/import?expected='+encodeURIComponent(reviewed.packetSha256),reviewed.file,true);
 await refresh();$('source-set').value=selected.id;renderSource();$('source-import').disabled=true;notice('Complete original source collection retained. Select its locations or continue your current customer selection.');
});
$('source-set').onchange=renderSource;
$('source-window-use').onclick=action(async()=>{
 const source=state.sourceSets.find(v=>v.id===$('source-set').value),window=source?.reportWindows.find(v=>v.id===$('source-window').value);
 if(!window)throw new Error('Select one retained reporting period.');$('start').value=window.start.slice(0,16);$('end').value=window.end.slice(0,16);notice('Reporting period selected. Choose the prior edition when continuing an existing report.');
});
$('source-use').onclick=action(async()=>{
 const source=state.sourceSets.find(v=>v.id===$('source-set').value);if(!source)throw new Error('Select the retained source collection.');
 const current=readProject(),selected=source.commonMeasures;
 projectForm({id:loadedProjectId,createdAt:state.currentProject?.createdAt??'',value:{...current,connectionId:source.connectionId,bucket:source.range.bucket,locations:source.locations.map(({id,sourceType,label,timezone})=>({id,sourceType,label,timezone})),measures:selected,thresholds:Object.fromEntries(Object.entries(current.thresholds).filter(([key])=>selected.includes(key)))}});
 $('project-state').textContent='Source locations selected. Review customer labels, timezones and measurements, then save the project revision.';
 if(source.reportWindows[0]){$('source-window').value=source.reportWindows[0].id;$('start').value=source.reportWindows[0].start.slice(0,16);$('end').value=source.reportWindows[0].end.slice(0,16);}
 notice('Original source locations and common measurements selected for this customer project.');
});
$('receive-file').onchange=()=>{receivingGeneration++;receiveReview=null;$('receive-commit').disabled=true;$('receiving-detail').replaceChildren();};
$('receive-review').onclick=action(async()=>{
 const generation=++receivingGeneration,file=$('receive-file').files[0];receiveReview=null;$('receive-commit').disabled=true;if(!file)throw new Error('Select the complete ZIP or editable JSON.');
 const inspected=await request('/api/receive/review',file,true);if(generation!==receivingGeneration||$('receive-file').files[0]!==file)return;receiveReview={...inspected,file,generation};
 $('receiving-detail').innerHTML='<h3>'+escape(inspected.title)+'</h3><p>'+escape(inspected.organisation)+' · '+inspected.reports+' report editions · '+inspected.captures+' original responses · '+number(inspected.sourceBytes)+' source bytes</p>'+rowTable(inspected.rows);$('receive-commit').disabled=receiveCommitPending;
});
$('receive-commit').onclick=action(async()=>{
 const reviewed=receiveReview;if(receiveCommitPending||!reviewed||reviewed.generation!==receivingGeneration||reviewed.file!==$('receive-file').files[0])throw new Error('Review this package first.');
 receiveCommitPending=true;$('receive-commit').disabled=true;
 try{
  const receipt=await request('/api/receive/commit?expected='+encodeURIComponent(reviewed.packageSha256),reviewed.file,true);
  await refresh();$('report').value=receipt.reportId;renderReport();renderReceivingSelection(receipt.id);
  if(receiveReview===reviewed)receiveReview=null;
  notice('Complete customer study received. Its saved project and prior edition are selected in Continue a received study.');
 }finally{
  receiveCommitPending=false;$('receive-commit').disabled=!receiveReview||receiveReview.generation!==receivingGeneration||receiveReview.file!==$('receive-file').files[0];
 }
});
$('received-selection').onchange=()=>renderReceivingSelection($('received-selection').value);
$('receive-select').onclick=action(async()=>{
 const selected=receivedSelection;if(!selected)throw new Error('Choose a received study.');
 const report=state.reports.find(v=>v.id===selected.reportId&&v.sha256===selected.reportSha256&&v.projectId===selected.projectId),plan=state.plans.find(v=>v.id===report?.planId&&v.projectId===selected.projectId);
 if(!report||!plan)throw new Error('Reopen the committed receiving selection.');
 await request('/api/project/select',{id:selected.projectId});await refresh();$('baseline').value=selected.reportId;$('report').value=selected.reportId;$('plan').value=plan.id;$('source-set').value=plan.sourceSetId??'';
 review=null;reportReviewGeneration++;$('commit').disabled=true;$('report-review').replaceChildren();
 renderSource();$('source-window').value='';renderPlan();renderReport();notice('Received project and its committed prior edition selected. Choose the next reporting period from the retained source or a new acquisition.');
});
function base64(bytes){let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);}
$('definition-fetch').onclick=action(async()=>{const result=await request('/api/definition',{});definitionBase64=result.definitionBase64;$('definition-inspection').textContent=JSON.stringify(result.inspection,null,2);notice('Official Dashboard source definition retained. The built-in Dashboard history connection follows its declared per-location history route.');});
$('definition-file').onchange=action(async()=>{const file=$('definition-file').files[0];if(!file)return;const bytes=new Uint8Array(await file.arrayBuffer());definitionBase64=base64(bytes);$('definition-inspection').textContent=JSON.stringify(JSON.parse(new TextDecoder().decode(bytes)),null,2);});
$('binding').value=JSON.stringify({id:'dashboard-customer',title:'Customer Dashboard',tokenEnv:'AIRGRADIENT_TOKEN'},null,2);
$('connection-save').onclick=action(async()=>{if(!definitionBase64)throw new Error('Read or open the official Dashboard definition first.');const result=await request('/api/connection',{definitionBase64,binding:JSON.parse($('binding').value)});await refresh();$('connection').value=result.id;configureLocationTypes();notice('Dashboard source connection saved. Save the project revision with this connection.');});
const end=new Date();end.setUTCHours(0,0,0,0);$('end').value=end.toISOString().slice(0,16);$('start').value=new Date(end.getTime()-30*86400000).toISOString().slice(0,16);
refresh().catch(e=>notice(e.message,true));
