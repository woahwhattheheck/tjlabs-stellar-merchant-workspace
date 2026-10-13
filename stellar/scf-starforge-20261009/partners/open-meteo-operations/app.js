const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>v===null||v===undefined?'—':Number(v).toLocaleString('en',{maximumFractionDigits:3});
let renewalChoices=null,renewalInput=null,renewalReview=null,renewalResult=null,renewalBusy=false,renewalSelection=0;
let receivingInput=null,receivingReview=null,receivingBusy=false,receivingSelection=0;
let state,meta,tab='requests',requestId=null,captureId=null,variable='temperature_2m',decisionEdit=null,sourceView=null,sourceSelection=0,comparison=null,polling=false,lastJob=null;
async function api(path,input){const response=await fetch(path,input===undefined?{cache:'no-store'}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});const value=await response.json();if(!response.ok)throw Object.assign(new Error(value.error??'Request failed'),value);return value;}
function notice(value){$('#notice').textContent=value??'';}
function error(e){notice((e.code??e.message??'Operation failed').replaceAll('_',' '));}
async function refresh(){
 const first=!meta;state=await api('/api/state');meta??=await api('/api/meta');
 if(first&&meta.reviewMode)tab='reports';
 $('#mode').textContent=meta.reviewMode?'Independent weather review workspace':meta.providerMode==='evaluation'?'Evaluation workspace · Original buyer accounting':'Professional provider workspace · Original buyer accounting';
 const recovery=document.querySelector('[data-tab="recovery"]');if(recovery&&meta.reviewMode)recovery.textContent='Receiving history';
 render();
}
async function ensureSource(id){
 if(!state.captures.some(value=>value.id===id)){
  const response=await api('/api/captures/'+encodeURIComponent(id));state.captures.push(response.capture);
 }
}
function selected(){return state.requests.find(q=>q.id===requestId)??null;}
const selectedCapture=()=>state.captures.find(c=>c.id===captureId)??null;
const option=(value,label,selected=false)=>'<option value="'+esc(value)+'"'+(selected?' selected':'')+'>'+esc(label)+'</option>';
const badge=text=>'<span class="badge">'+esc(text.replaceAll('_',' '))+'</span>';
const actions=html=>'<div class="actions">'+html+'</div>';
const button=(action,label,id,style='')=>'<button type="button" data-action="'+action+'"'+(id?' data-id="'+esc(id)+'"':'')+' class="'+style+'">'+esc(label)+'</button>';
function render(){document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-current',b.dataset.tab===tab?'page':'false'));$('#main').innerHTML=tab==='requests'?requestsTab():tab==='analysis'?analysisTab():tab==='reports'?reportsTab():recoveryTab();if(tab==='analysis'&&captureId)loadSource().catch(error);}
function requestsTab(){
 if(meta.reviewMode){
  const rows=state.requests.map(q=>'<tr><td>'+button('select-request',q.spec.title,q.id)+'<br><small>'+esc(q.spec.site.name)+'</small></td><td>'+esc(q.spec.request.family)+' / '+esc(q.spec.request.model)+'</td><td>'+esc(q.spec.request.startDate)+' — '+esc(q.spec.request.endDate)+'</td></tr>').join('');
  return '<section class="panel"><h2>Received source selections</h2><p>Each selection retains the original site, model, time window and units. Open its source to continue analysis and decisions.</p>'+(rows?'<div class="table"><table><thead><tr><th>Selection</th><th>Product</th><th>Window</th></tr></thead><tbody>'+rows+'</tbody></table></div>':'<p class="empty">Receive an editable package in Frozen reports to begin.</p>')+'</section>'+requestDetail();
 }
 const sites=state.sites.map(s=>'<tr><td>'+esc(s.name)+'<br><small>'+esc(s.latitude+', '+s.longitude)+' · '+esc(s.timezone)+'</small></td><td>r'+s.revision+'</td><td>'+button('edit-site','Revise',s.id)+'</td></tr>').join('');
 const siteForm='<section class="panel"><h2>Site</h2><form id="site-form"><input name="id" type="hidden"><input name="expectedRevision" type="hidden" value="0"><label>Name<input name="name" required maxlength="120"></label><div class="row"><label>Latitude<input name="latitude" type="number" step="any" min="-90" max="90" required></label><label>Longitude<input name="longitude" type="number" step="any" min="-180" max="180" required></label></div><label>IANA time zone<input name="timezone" value="America/New_York" required></label><div class="row"><label>Grid selection<select name="cellSelection"><option>land</option><option>sea</option><option>nearest</option></select></label><label>Elevation, metres<input name="elevation" placeholder="Automatic"></label></div><label>Site notes<textarea name="notes"></textarea></label>'+actions('<button class="primary">Save site revision</button>'+button('new-site','New site'))+'</form></section>';
 const requestForm='<section class="panel"><h2>New weather request</h2><form id="request-form"><label>Title<input name="title" required></label><label>Site revision<select name="siteId" required>'+state.sites.map(s=>option(s.id,s.name+' · revision '+s.revision)).join('')+'</select></label><div class="row"><label>Data product<select name="family" id="family">'+Object.entries(meta.families).map(([k,v])=>option(k,v.title)).join('')+'</select></label><label>Model<select name="model" id="model">'+meta.families.forecast.models.map(m=>option(m,m)).join('')+'</select></label></div><div class="row"><label>First date<input name="startDate" type="date" required value="'+new Date().toISOString().slice(0,10)+'"></label><label>Last date, inclusive<input name="endDate" type="date" required value="'+new Date().toISOString().slice(0,10)+'"></label></div><label>Hourly variables</label><div class="variables">'+Object.entries(meta.variables).map(([k,v],i)=>'<label><input type="checkbox" name="variables" value="'+k+'"'+(i<3?' checked':'')+'> '+esc(v.title)+'</label>').join('')+'</div><div class="row"><label>Temperature<select name="temperature"><option>celsius</option><option>fahrenheit</option></select></label><label>Wind<select name="wind"><option>kmh</option><option>ms</option><option>mph</option><option>kn</option></select></label><label>Precipitation<select name="precipitation"><option>mm</option><option>inch</option></select></label></div>'+actions('<button class="primary"'+(!state.sites.length?' disabled':'')+'>Save exact request</button>')+'</form><p class="muted">Each request retains one site revision, model, inclusive date range, variables and units. A later source read creates another capture of that same selection.</p></section>';
 const rows=state.requests.map(q=>'<tr'+(q.id===requestId?' class="selected"':'')+'><td>'+button('select-request',q.spec.title,q.id)+'<br><small>'+esc(q.spec.site.name)+'</small></td><td>'+esc(q.spec.request.family)+'<br>'+esc(q.spec.request.model)+'</td><td>'+esc(q.spec.request.startDate)+'<br>'+esc(q.spec.request.endDate)+'</td><td>'+badge(q.state)+'</td></tr>').join('');
 return '<div class="grid"><div>'+siteForm+(sites?'<section class="panel"><h2>Retained sites</h2><table><tbody>'+sites+'</tbody></table></section>':'')+'</div><div>'+requestForm+'<section class="panel"><h2>Requests</h2>'+(rows?'<div class="table"><table><thead><tr><th>Selection</th><th>Product</th><th>Window</th><th>State</th></tr></thead><tbody>'+rows+'</tbody></table></div>':'<p class="empty">Save a site and request to begin.</p>')+'</section>'+requestDetail()+'</div></div>';
}
function requestDetail(){
 const q=selected();if(!q)return '';const r=q.spec.request,n=q.native;
 let controls='';
 if(meta.reviewMode||q.state==='RECEIVED'){controls='<p class="muted">This source belongs to a received report. Its original source and receiving history remain available with the editable decisions.</p>';}
 else if(!n){controls=actions(button('capture-source','Read provider source',q.id,'primary')+(q.error?.retainedRead?button('source-reprocess','Reprocess retained original bytes',q.id):''))+'<h3>Prepare through the original buyer</h3><form id="prepare-form"><div class="row"><label>Maximum payment, atomic units<input name="maxAtomic" inputmode="numeric" pattern="[1-9][0-9]*" required placeholder="Explicit budget"></label><label>Offer index<input type="number" name="acceptIndex" value="0" min="0" required></label></div>'+(meta.providerMode==='evaluation'?'<label class="check"><input name="directEvaluation" type="checkbox">Use the public evaluation endpoint for an unsigned native buyer request.</label>':'')+actions('<button'+(!['DRAFT','PREPARING'].includes(q.state)?' disabled':'')+'>Prepare and review</button>')+'</form><p class="muted">Buyer preparation uses a new draft. A provider capture remains an independently identified source read.</p>';}
 else controls='<dl><dt>Original intent</dt><dd class="mono">'+esc(n.request.intentId)+'</dd><dt>Maximum payment</dt><dd>'+esc(n.maxAtomic)+' atomic units</dd><dt>Reviewed request</dt><dd class="mono">'+esc(n.request.url)+'</dd><dt>Configuration hash</dt><dd class="mono">'+esc(n.review?.configSha256??'Preparation in progress')+'</dd></dl>'+actions((n.review?button('execute','Execute reviewed buyer request',q.id,'primary'):'')+button('recover','Read original buyer outcome',q.id));
 return '<section class="panel"><h2>'+esc(q.spec.title)+'</h2><p>'+badge(q.state)+' · revision '+q.revision+'</p><dl><dt>Coordinates</dt><dd>'+esc(r.latitude+', '+r.longitude)+'</dd><dt>Time zone</dt><dd>'+esc(r.timezone)+'</dd><dt>Variables</dt><dd>'+esc(r.variables.join(', '))+'</dd><dt>Request digest</dt><dd class="mono">'+esc(q.specSha256)+'</dd></dl>'+controls+actions((meta.reviewMode?'':button('copy-request','Copy to new draft',q.id))+(q.captureId?button('view-source','Open retained source',q.captureId):''))+(q.error?'<pre>'+esc(JSON.stringify(q.error,null,2))+'</pre>':'')+'</section>';
}
function decisionRevisionLabel(decision){
 for(const record of state.receiving??[]){
  const mapping=record.mapping.decisions.find(value=>value.local===decision.id);
  if(mapping){
   const original=record.originalDecisions.find(value=>value.id+':'+value.revision===mapping.original);
   if(original)return 'Original revision '+original.revision+' · local revision '+decision.revision;
  }
 }
 return 'Revision '+decision.revision;
}
function analysisTab(){
 const captures=state.captures.map(c=>'<tr'+(c.id===captureId?' class="selected"':'')+'><td>'+button('view-source',c.request.title,c.id)+'<br><small>'+esc(c.provenance.retrievedAt)+'</small></td><td>'+esc(c.metadata.family)+' / '+esc(c.metadata.model)+'</td><td>'+esc(c.provenance.kind)+'</td><td>'+num(c.bytes)+'</td></tr>').join('');
 const decisions=state.decisions.map(d=>'<tr><td>'+esc(d.title)+'<br><small>'+esc(d.owner)+' · '+esc(decisionRevisionLabel(d))+'</small></td><td>'+badge(d.result.outcome)+'<br>'+d.result.thresholdMembers+' / '+d.result.eligibleMembers+' eligible</td><td>'+esc(d.disposition)+'</td><td>'+button('revise-decision','Revise',d.id)+'</td></tr>').join('');
 return '<section class="panel"><h2>Retained original sources</h2>'+(captures?'<div class="table"><table><thead><tr><th>Request / retrieval</th><th>Product</th><th>Acquisition</th><th>Bytes</th></tr></thead><tbody>'+captures+'</tbody></table></div>':'<p class="empty">Read a provider source or execute a prepared buyer request.</p>')+'</section><div id="source-details"></div><section class="panel"><h2>Operator decisions</h2>'+(decisions?'<div class="table"><table><thead><tr><th>Decision</th><th>Result</th><th>Disposition</th><th></th></tr></thead><tbody>'+decisions+'</tbody></table></div>':'<p class="empty">Select a retained source to evaluate a window.</p>')+'</section>';
}
async function loadSource(){
 const selection=++sourceSelection,c=selectedCapture();if(!c){$('#source-details').innerHTML='';return;}
 const selectedDecision=decisionEdit,editing=selectedDecision?.captureId===c.id?selectedDecision:null;
 if(!editing&&!c.request.request.variables.includes(variable))variable=c.request.request.variables[0];
 const id=c.id,v=variable,rule=editing?.rule,unit=rule?.unit;
 sourceView=null;$('#source-details').innerHTML='<section class="panel"><p>Loading retained source…</p></section>';
 const response=await api('/api/captures/'+encodeURIComponent(id)+'?variable='+encodeURIComponent(v)+(unit?'&unit='+encodeURIComponent(unit):''));
 if(selection!==sourceSelection||tab!=='analysis'||captureId!==id||variable!==v||decisionEdit!==selectedDecision)return;sourceView=response;
 const s=response.series;
 const first=s.rows[0],last=s.rows.at(-1);
 const start=rule?.startUtc??first?.utc??'',end=rule?.endUtc??(last?new Date((last.epoch+(s.interval.startsWith('preceding-')?0:3600))*1000).toISOString():'');
 const sample=s.rows.slice(0,48).map(r=>'<tr><td class="mono">'+esc(r.utc)+'</td><td>'+esc(r.local)+' '+esc(r.offset)+'</td><td>'+num(r.min)+'</td><td>'+num(r.median)+'</td><td>'+num(r.max)+'</td><td>'+r.availableMembers+' / '+r.returnedColumns+'</td></tr>').join('');
 const form='<form id="decision-form"><h2>'+ (editing?'Revise operator decision':'Evaluate an operating window')+'</h2><label>Decision title<input name="title" required value="'+esc(editing?.title??c.request.title+' review')+'"></label><div class="row"><label>Owner<input name="owner" required value="'+esc(editing?.owner??'')+'"></label><label>Disposition<select name="disposition">'+['review','monitor','reschedule','proceed'].map(x=>option(x,x,x===(editing?.disposition??'review'))).join('')+'</select></label></div><div class="row"><label>Start UTC<input name="startUtc" required value="'+esc(start)+'"></label><label>End UTC<input name="endUtc" required value="'+esc(end)+'"></label></div><div class="row"><label>Aggregate<select name="aggregation">'+['max','min','mean',...(s.interval==='preceding-hour-sum'?['sum']:[])].map(x=>option(x,x,x===(rule?.aggregation??'max'))).join('')+'</select></label><label>Threshold<select name="operator">'+option('gte','≥',rule?.operator!=='lte')+option('lte','≤',rule?.operator==='lte')+'</select></label><label>Value, '+esc(s.unit)+'<input name="threshold" type="number" step="any" required value="'+esc(rule?.threshold??'')+'"></label><label>Minimum coverage<input name="minimumCoverage" type="number" min="0.01" max="1" step="0.01" value="'+esc(rule?.minimumCoverage??1)+'" required></label></div><label>Operating notes<textarea name="notes">'+esc(editing?.notes??'')+'</textarea></label>'+actions('<button class="primary">Save decision revision</button>'+button('new-decision','New decision'))+'</form>';
 const compare='<h3>Compare another capture</h3><form id="compare-form"><label>Same requested coordinates<select name="right">'+state.captures.filter(other=>other.id!==id&&other.metadata.requested.latitude===c.metadata.requested.latitude&&other.metadata.requested.longitude===c.metadata.requested.longitude).map(other=>option(other.id,other.request.title+' · '+other.metadata.model+' · '+other.provenance.retrievedAt)).join('')+'</select></label>'+actions('<button>Compare exact UTC timestamps</button>')+'</form><div id="comparison"></div>';
 $('#source-details').innerHTML='<section class="panel"><h2>'+esc(c.request.title)+'</h2><div class="row"><label class="short">Variable<select id="source-variable">'+[...new Set([...c.request.request.variables,v])].map(x=>option(x,meta.variables[x].title,x===v)).join('')+'</select></label><p class="muted">'+esc(s.unit)+' · '+esc(s.interval)+' · '+s.total+' timestamps</p></div>'+response.chart+
  '<div class="split"><dl><dt>Requested site</dt><dd>'+esc(c.metadata.requested.latitude+', '+c.metadata.requested.longitude)+'</dd><dt>Model grid</dt><dd>'+esc(c.metadata.grid.latitude+', '+c.metadata.grid.longitude)+'</dd><dt>Time zone</dt><dd>'+esc(c.metadata.timezone)+'</dd><dt>API fixed offset</dt><dd>'+c.metadata.apiUtcOffsetSeconds+' seconds</dd><dt>Source</dt><dd>'+esc(c.metadata.meaning)+'</dd></dl><div><p class="mono">Original source SHA-256<br>'+esc(c.sha256)+'</p><p>'+esc(s.quantileMethod)+'</p>'+actions('<a class="button" href="/api/captures/'+id+'/raw">Original JSON</a><a class="button" href="/api/captures/'+id+'/csv">Complete series CSV</a>')+compare+'</div></div>'+
  '<details><summary>First '+Math.min(48,s.total)+' hourly rows</summary><div class="table"><table><thead><tr><th>UTC</th><th>Local time / offset</th><th>Minimum</th><th>Median</th><th>Maximum</th><th>Available members</th></tr></thead><tbody>'+sample+'</tbody></table></div></details></section><section class="panel">'+form+'</section>';
}
function receivingPanel(){
 const review=receivingReview;
 const sources=review?review.sources.map(s=>'<tr><td>'+esc(s.title)+'<br><small>'+esc(s.site)+'</small></td><td>'+esc(s.family)+' / '+esc(s.model)+'</td><td>'+s.timestamps+' hours / '+s.columns+' columns</td><td>'+num(s.bytes)+'</td></tr>').join(''):'';
 const result=review?'<h3>'+esc(review.title)+'</h3><p>'+esc(review.owner)+' · '+esc(review.createdAt)+'</p><p>'+review.sourceCount+' complete sources · '+review.decisionRevisions+' decision revisions · '+review.receivingHistory+' earlier receiving records</p>'+(review.originalArchive?'<p>Original ZIP: '+num(review.originalArchive.bytes)+' bytes. This original retains the selected decision revisions; later local revisions continue in this workspace.</p>':'')+'<div class="table"><table><thead><tr><th>Source</th><th>Product</th><th>Coverage</th><th>Bytes</th></tr></thead><tbody>'+sources+'</tbody></table></div>'+
  (review.conflicts.length?'<p role="alert">Existing original records differ. The complete local work is retained.</p><pre>'+esc(JSON.stringify(review.conflicts,null,2))+'</pre>':'')+
  (review.receipt?actions(button('continue-received','Edit received decisions',review.receipt.mapping.report.local)):'')+actions('<button type="button" data-action="receive-handover"'+(!review.canReceive||receivingBusy?' disabled':'')+'>'+esc(review.alreadyReceived?'Reopen received report':'Receive complete editable work')+'</button>'):'';
 return '<section class="panel"><h2>Receive an editable weather package</h2><p>Choose the complete .weather.json package. Review its sources and decision revisions, then receive it into this workspace.</p><label>Weather package<input id="handover-file" type="file" accept=".json,application/json"'+(receivingBusy?' disabled':'')+'></label>'+
  (receivingInput?'<p>'+esc(receivingInput.name)+' · '+num(receivingInput.bytes)+' bytes</p>'+actions('<button type="button" data-action="review-handover"'+(receivingBusy?' disabled':'')+'>Review complete package</button>'):'')+result+'</section>';
}
function receivingHistoryPanel(){
 const records=state.receiving??[];
 return '<section class="panel"><h2>Original receiving history</h2><p>Each receiving retains its original package, complete source relationships and the corresponding local report. Local decision revisions continue in Sources & decisions.</p>'+
  (records.length?records.map(record=>'<details><summary>'+esc(record.originalReport.title)+' · '+esc(record.receivedAt)+'</summary><p>'+record.originalSources.length+' original sources · '+record.originalDecisions.length+' original decision revisions</p>'+
   actions(button('continue-received','Edit received decisions',record.mapping.report.local)+'<a class="button" href="/api/receiving/'+record.packageSha256+'/original">Original received package</a><a class="button" href="/api/reports/'+record.mapping.report.local+'/download?format=handover">Editable local package</a>')+
   actions(record.mapping.captures.map(mapping=>button('view-source',record.originalSources.find(source=>source.id===mapping.original)?.request.title??'Original source',mapping.local)).join(''))+'<pre>'+esc(JSON.stringify(record.mapping,null,2))+'</pre></details>').join(''):'<p class="empty">Received packages appear here with their original report and source relationships.</p>')+'</section>';
}
function renewalReviewPanel(){
 if(!renewalReview)return '';
 const rows=renewalReview.entries.map(entry=>{
  const before=entry.baseline,after=entry.proposed,c=entry.comparison;
  const rule=decision=>esc(decision.rule.aggregation)+' '+esc(decision.rule.operator==='gte'?'≥':'≤')+' '+num(decision.rule.threshold)+' '+esc(decision.rule.unit);
  return '<tr><td>'+esc(after.title)+'<br><small>'+esc(after.owner)+'</small></td><td>'+badge(before.result.outcome)+'<br>'+num(c.previousAggregate)+' '+esc(c.previousUnit)+'<br><small>'+rule(before)+'<br>'+esc(before.rule.startUtc)+'<br>'+esc(before.rule.endUtc)+'</small></td>'+
   '<td>'+badge(after.result.outcome)+'<br>'+num(c.nextAggregate)+' '+esc(c.nextUnit)+'<br><small>'+rule(after)+'<br>'+esc(after.rule.startUtc)+'<br>'+esc(after.rule.endUtc)+'</small></td>'+
   '<td>'+c.previousEligibleMembers+' → '+c.nextEligibleMembers+' eligible members<br>'+esc(after.disposition)+'<br><small>'+esc(c.sameUtcWindow?'Same UTC window':'Different operating windows')+(c.ruleChanges.length?'<br>Reviewed rule changed since prior edition':'')+'<br>'+esc(c.previousModel)+' → '+esc(c.nextModel)+(c.gridChanged?'<br>Selected model grid changed':'')+'</small></td></tr>';
 }).join('');
 const sources=renewalReview.entries.map(entry=>'<p><strong>'+esc(entry.proposed.title)+'</strong><br>'+esc(entry.comparison.previousRetrievedAt)+' → '+esc(entry.comparison.nextRetrievedAt)+'<br><small>'+esc(entry.comparison.sourceChanged?'New retained source bytes':'Same retained source bytes')+' · Grid '+esc(entry.source.metadata.grid.latitude+', '+entry.source.metadata.grid.longitude)+'</small></p>').join('');
 return '<h3>Review the complete next edition</h3><p>'+renewalReview.summary.decisions+' decisions · '+renewalReview.summary.changedSources+' changed sources · '+renewalReview.summary.changedOutcomes+' changed outcomes · '+renewalReview.summary.insufficientCoverage+' with insufficient coverage</p>'+
  '<div class="table"><table><thead><tr><th>Customer decision</th><th>Prior edition</th><th>Next edition</th><th>Coverage and operating choice</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
  '<details><summary>Source retrieval and model grid</summary>'+sources+'</details>'+
  '<p class="muted">Aggregates belong to the displayed rules and windows. Returned ensemble members do not establish calibrated event probabilities. Creating the edition saves the reviewed dispositions and notes.</p>'+
  actions('<button type="button" data-action="commit-renewal" class="primary"'+(renewalBusy?' disabled':'')+'>Create reviewed edition</button>');
}
function renewalPanel(){
 if(!renewalInput||!renewalChoices){
  if(!renewalResult)return '';
  const report=renewalResult.report;
  return '<section class="panel"><h2>'+esc(report.title)+'</h2><p>'+esc(renewalResult.reopened?'Reopened the same renewed edition.':'The complete next edition is saved.')+' '+report.decisions.length+' decision revisions with their original history.</p>'+actions(
   '<a class="button" href="/api/reports/'+report.id+'/download?format=handover">Editable customer package</a><a class="button" href="/api/reports/'+report.id+'/download?format=zip">Complete ZIP</a><a class="button" href="/api/reports/'+report.id+'/download?format=html">Customer report</a>'+button('renew-report','Prepare following edition',report.id))+'</section>';
 }
 const entries=renewalInput.entries.map((entry,index)=>{
  const choice=renewalChoices.entries.find(value=>value.working.id===entry.decisionId),working=choice.working;
  return '<fieldset class="renewal-entry"><legend>'+esc(working.title)+'</legend><p>'+esc(working.owner)+' · Current revision '+working.revision+' · '+esc(meta.variables[working.rule.variable].title)+' · '+esc(working.rule.aggregation)+' '+esc(working.rule.operator==='gte'?'≥':'≤')+' '+num(working.rule.threshold)+' '+esc(working.rule.unit)+'</p>'+
   '<label>Retained source for this edition<select name="capture-'+index+'" required>'+choice.candidates.map(c=>option(c.id,c.request.title+' · '+c.metadata.model+' · '+(c.provenance.retrievedAt??c.capturedAt),c.id===entry.captureId)).join('')+'</select></label>'+
   '<div class="row"><label>Start UTC<input name="start-'+index+'" required value="'+esc(entry.startUtc)+'"></label><label>End UTC<input name="end-'+index+'" required value="'+esc(entry.endUtc)+'"></label></div>'+
   '<label>Reviewed operating disposition<select name="disposition-'+index+'">'+['review','monitor','reschedule','proceed'].map(value=>option(value,value,value===entry.disposition)).join('')+'</select></label>'+
   '<label>Edition notes<textarea name="notes-'+index+'" maxlength="10000">'+esc(entry.notes??'')+'</textarea></label></fieldset>';
 }).join('');
 return '<section class="panel" id="report-renewal"><h2>Prepare the next customer edition</h2><p>Prior frozen report: '+esc(renewalChoices.report.title)+' · '+esc(renewalChoices.report.createdAt)+'</p>'+
  '<p>Choose retained sources acquired through Sites & requests, or received in a complete customer package. Current working rules keep their exact variable, unit, threshold and coverage requirement. Review the operating disposition for the new edition.</p>'+
  '<form id="renewal-form"><fieldset class="renewal-fields"'+(renewalBusy?' disabled':'')+'><div class="row"><label>Customer report title<input name="renewalTitle" required maxlength="240" value="'+esc(renewalInput.title)+'"></label><label>Responsible operator<input name="renewalOwner" required maxlength="120" value="'+esc(renewalInput.owner)+'"></label></div>'+
  '<label>Report notes<textarea name="renewalNotes" maxlength="10000">'+esc(renewalInput.notes??'')+'</textarea></label>'+
  '<div class="row"><label>Shift all UTC windows, hours<input type="number" step="0.5" name="shiftHours" value="12"></label>'+button('shift-renewal','Apply UTC window shift')+'</div>'+
  '<p class="muted">A UTC shift preserves elapsed duration. For a local calendar change across daylight saving time, enter each intended UTC boundary explicitly.</p>'+entries+
  actions('<button class="primary">Review complete next edition</button>'+button('close-renewal','Close renewal'))+'</fieldset></form>'+
  '<div id="renewal-review">'+renewalReviewPanel()+'</div></section>';
}
function readRenewalForm(form){
 const data=new FormData(form),value=name=>String(data.get(name)??'');
 return {...renewalInput,title:value('renewalTitle'),owner:value('renewalOwner'),notes:value('renewalNotes'),
  entries:renewalInput.entries.map((entry,index)=>({...entry,captureId:value('capture-'+index),
   startUtc:value('start-'+index),endUtc:value('end-'+index),disposition:value('disposition-'+index),notes:value('notes-'+index)}))};
}
function invalidateRenewal(event){
 const form=event.target.closest?.('#renewal-form');if(!form||renewalBusy)return;
 renewalInput=readRenewalForm(form);renewalReview=null;
 const review=$('#renewal-review');if(review)review.innerHTML='';
}
document.addEventListener('input',invalidateRenewal);document.addEventListener('change',invalidateRenewal);
function reportsTab(){
 const selections=state.decisions.map(d=>'<label class="check"><input type="checkbox" name="decision" value="'+d.id+'"> <span>'+esc(d.title)+' · '+esc(decisionRevisionLabel(d))+'<br><small>'+esc(d.disposition)+' · '+esc(d.result.outcome)+'</small></span></label>').join('');
 const rows=state.reports.map(r=>'<tr><td>'+esc(r.title)+'<br><small>'+esc(r.owner)+' · '+esc(r.createdAt)+'</small></td><td>'+r.decisions.length+' decisions / '+r.captures.length+' sources</td><td>'+actions('<a class="button" href="/api/reports/'+r.id+'/download?format=handover">Editable package</a><a class="button" href="/api/reports/'+r.id+'/download?format=zip">Complete ZIP</a><a class="button" href="/api/reports/'+r.id+'/download?format=html">HTML report</a><a class="button" href="/api/reports/'+r.id+'/download?format=json">JSON</a>'+button('renew-report','Prepare next edition',r.id))+'<small class="mono">'+esc(r.sha256)+'</small></td></tr>').join('');
 return receivingPanel()+renewalPanel()+'<div class="grid"><section class="panel"><h2>Freeze selected decisions</h2><form id="report-form"><label>Report title<input name="title" required></label><label>Responsible operator<input name="owner" required></label><h3>Exact decision revisions</h3>'+selections+'<label>Handover notes<textarea name="notes"></textarea></label>'+actions('<button class="primary"'+(!selections?' disabled':'')+'>Freeze report</button>')+'</form><p class="muted">The frozen report keeps these decision revisions and exact original source hashes. Subsequent operating changes remain separate.</p></section><section class="panel"><h2>Frozen reports</h2>'+(rows?'<div class="table"><table><thead><tr><th>Report</th><th>Selected content</th><th>Download</th></tr></thead><tbody>'+rows+'</tbody></table></div>':'<p class="empty">Freeze one or more decisions to prepare a handover.</p>')+'</section></div>';
}
function recoveryTab(){
 if(meta.reviewMode)return receivingHistoryPanel();
 return receivingHistoryPanel()+ '<div class="grid"><section class="panel"><h2>Original buyer recovery</h2><p>Capture the original operator ledger and credentials together with retained weather sources, request configurations and frozen reports. The original recovery engine owns encryption, checkpointing and same-root restoration.</p>'+actions(button('recovery-review','Review complete state'))+'<form id="snapshot-form"><label>New archive directory<input name="output" required placeholder="/private/backups/weather-2026-10-11"></label><label>Passphrase environment reference<input name="passphraseEnv" required value="OPEN_METEO_BACKUP_PASSPHRASE" pattern="[A-Za-z_][A-Za-z0-9_]*"></label>'+actions('<button class="primary">Create encrypted snapshot</button>')+'</form><p class="muted">Configure the named passphrase in the process environment before starting this workspace.</p></section><section class="panel"><h2>Verify a retained snapshot</h2><form id="verify-form"><label>Archive directory<input name="bundle" required></label><label>Original record SHA-256<input name="expectedRecordSha256" required pattern="[a-f0-9]{64}"></label><label>Passphrase environment reference<input name="passphraseEnv" required value="OPEN_METEO_BACKUP_PASSPHRASE"></label>'+actions('<button>Verify with original recovery engine</button>')+'</form><h3>Restore and reopen</h3><p>Stop this workspace. Use the retained record hash and passphrase reference with the CLI restore command when the original state root is absent, then serve the restored settings. Restore preserves the existing request and ledger identities; execution remains an explicit operator action.</p><pre>node cli.mjs recovery restore \\\n  --bundle /private/backups/weather-2026-10-11 \\\n  --record-sha ORIGINAL_RECORD_SHA256 \\\n  --passphrase-env OPEN_METEO_BACKUP_PASSPHRASE\n\nnode cli.mjs serve --settings /private/weather/settings.json</pre></section></div>';
}
async function start(kind,args){lastJob=await api('/api/jobs',{kind,...args});renderJob(lastJob);poll();}
function renderJob(job){lastJob=job;$('#job').innerHTML=job?'<strong>'+esc(job.kind)+' · '+esc(job.state)+'</strong><span>'+esc(job.startedAt)+'</span>'+(job.state==='RUNNING'?button('cancel-job','Cancel',job.id):'')+(job.error?'<pre>'+esc(JSON.stringify(job.error,null,2))+'</pre>':'')+(job.result&&job.kind.startsWith('recovery')?'<details><summary>Original recovery result</summary><pre>'+esc(JSON.stringify(job.result,null,2))+'</pre></details>':''):'';}
async function poll(){if(polling)return;polling=true;try{while(lastJob?.state==='RUNNING'){await new Promise(r=>setTimeout(r,1000));renderJob(await api('/api/job'));}await refresh();}catch(e){error(e);}finally{polling=false;}}
document.addEventListener('change',e=>{if(e.target.id==='family'){$('#model').innerHTML=meta.families[e.target.value].models.map(m=>option(m,m)).join('');}if(e.target.id==='source-variable'){variable=e.target.value;decisionEdit=null;loadSource().catch(error);}});
document.addEventListener('change',async e=>{
 if(e.target.id!=='handover-file')return;
 const selection=++receivingSelection,file=e.target.files?.[0];receivingInput=null;receivingReview=null;
 if(!file){render();return;}
 try{
  if(file.size>48*1024*1024)throw new Error('The complete weather package exceeds 48 MiB.');
  const content=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());
  if(selection!==receivingSelection)return;
  receivingInput={name:file.name,bytes:file.size,content};render();
 }catch(problem){if(selection===receivingSelection)error(problem);}
});
document.addEventListener('click',async e=>{
 const target=e.target.closest('button[data-tab],button[data-action],#refresh');if(!target)return;
 try{
  notice('');if(target.id==='refresh'){await refresh();return;}if(target.dataset.tab){tab=target.dataset.tab;render();return;}
  const action=target.dataset.action,id=target.dataset.id;
  if(action==='renew-report'){
   if(renewalBusy)return;
   const selection=++renewalSelection;renewalBusy=true;
   try{
    const choices=await api('/api/reports/'+encodeURIComponent(id)+'/renewal');
    if(selection===renewalSelection){
     renewalChoices=choices;renewalInput=JSON.parse(JSON.stringify(choices.selection));renewalReview=null;renewalResult=null;tab='reports';
    }
   }finally{renewalBusy=false;render();}
   $('#report-renewal')?.scrollIntoView({block:'start'});return;
  }
  if(action==='close-renewal'){
   if(renewalBusy)return;
   renewalSelection++;renewalChoices=null;renewalInput=null;renewalReview=null;render();return;
  }
  if(action==='shift-renewal'){
   if(renewalBusy||!renewalInput)return;
   const form=$('#renewal-form'),hours=Number(new FormData(form).get('shiftHours'));
   if(!Number.isFinite(hours)||Math.abs(hours)>8784)throw new Error('Enter a UTC shift within one year.');
   const input=readRenewalForm(form),shift=hours*3600000;
   input.entries=input.entries.map(entry=>{
    const start=Date.parse(entry.startUtc),end=Date.parse(entry.endUtc);
    if(!Number.isFinite(start)||!Number.isFinite(end))throw new Error('Enter valid UTC window boundaries.');
    return {...entry,startUtc:new Date(start+shift).toISOString(),endUtc:new Date(end+shift).toISOString()};
   });
   renewalInput=input;renewalReview=null;render();return;
  }
  if(action==='commit-renewal'){
   if(renewalBusy||!renewalReview)return;
   const reviewed=renewalReview,selection=renewalSelection;renewalBusy=true;render();
   try{
    const result=await api('/api/renewal/commit',{selection:reviewed.selection,expectedReviewSha256:reviewed.reviewSha256});
    if(selection===renewalSelection){renewalResult=result;renewalChoices=null;renewalInput=null;renewalReview=null;}
    await refresh();notice(result.reopened?'Reopened the same customer edition.':'Saved all reviewed decisions and the complete next customer edition.');
   }finally{renewalBusy=false;render();}
   return;
  }
  if(action==='review-handover'||action==='receive-handover'){
   if(receivingBusy||!receivingInput)return;
   const input=receivingInput,selection=receivingSelection,review=receivingReview;
   if(action==='receive-handover'&&(!review?.canReceive))return;
   receivingBusy=true;render();
   try{
    if(action==='review-handover'){
     const result=await api('/api/handover/review',{content:input.content});
     if(selection===receivingSelection&&input===receivingInput)receivingReview=result;
    }else{
     const result=await api('/api/handover/receive',{content:input.content,expectedSha256:review.packageSha256});
     if(selection===receivingSelection&&input===receivingInput){
      receivingReview={...review,alreadyReceived:true,receipt:result.receipt};
      notice(result.reopened?'Reopened the same received report.':'Received complete source, decisions and report.');
     }
     await refresh();
    }
   }finally{receivingBusy=false;render();}
  }
  else if(action==='continue-received'){
   const report=state.reports.find(value=>value.id===id)??await api('/api/reports/'+encodeURIComponent(id)+'/download?format=json');
   decisionEdit=state.decisions.find(value=>value.id===report.decisions[0].id);
   if(!decisionEdit)throw new Error('Received decision is unavailable.');
   captureId=decisionEdit.captureId;await ensureSource(captureId);variable=decisionEdit.rule.variable;tab='analysis';render();
  }
  else if(action==='select-request'){requestId=id;render();}
  else if(action==='view-source'){captureId=id;await ensureSource(id);decisionEdit=null;tab='analysis';render();}
  else if(action==='capture-source'){const q=state.requests.find(q=>q.id===id);await start('source',{requestId:id,args:{expectedRevision:q.revision}});}
  else if(action==='source-reprocess'){const q=state.requests.find(q=>q.id===id);await start('source-reprocess',{requestId:id,args:{expectedRevision:q.revision}});}
  else if(action==='execute')await start('execute',{requestId:id});
  else if(action==='recover')await start('recover',{requestId:id});
  else if(action==='copy-request'){const q=state.requests.find(q=>q.id===id),r=await api('/api/requests',{siteId:q.spec.site.id,siteRevision:q.spec.site.revision,title:q.spec.title+' copy',request:q.spec.request});requestId=r.id;await refresh();}
  else if(action==='edit-site'){const site=state.sites.find(s=>s.id===id),form=$('#site-form');for(const [k,v]of Object.entries({...site,expectedRevision:site.revision})){const field=form.elements.namedItem(k);if(field)field.value=v??'';}form.scrollIntoView({block:'start'});}
  else if(action==='new-site'){$('#site-form').reset();$('#site-form').elements.id.value='';$('#site-form').elements.expectedRevision.value='0';}
  else if(action==='revise-decision'){decisionEdit=state.decisions.find(d=>d.id===id);captureId=decisionEdit.captureId;await ensureSource(captureId);variable=decisionEdit.rule.variable;await loadSource();}
  else if(action==='new-decision'){decisionEdit=null;await loadSource();}
  else if(action==='recovery-review')await start('recovery-review',{});
  else if(action==='cancel-job'){renderJob(await api('/api/cancel',{id}));}
 }catch(e){error(e);}
});
document.addEventListener('submit',async e=>{
 const form=e.target;if(!(form instanceof HTMLFormElement))return;e.preventDefault();const f=new FormData(form),v=k=>f.get(k);const submit=form.querySelector('button[type=submit],button:not([type])');if(submit)submit.disabled=true;
 try{notice('');
  if(form.id==='renewal-form'){
   if(renewalBusy)return;
   const input=readRenewalForm(form),selection=renewalSelection;renewalInput=input;renewalBusy=true;render();
   try{
    const result=await api('/api/renewal/review',input);
    if(selection===renewalSelection){renewalReview=result;renewalInput=JSON.parse(JSON.stringify(result.selection));}
   }finally{renewalBusy=false;render();}
   $('#renewal-review')?.scrollIntoView({block:'start'});
  }
  else if(form.id==='site-form'){const site={name:v('name'),latitude:Number(v('latitude')),longitude:Number(v('longitude')),timezone:v('timezone'),cellSelection:v('cellSelection'),notes:v('notes')};if(v('elevation')!=='')site.elevation=v('elevation')==='nan'?'nan':Number(v('elevation'));await api('/api/sites',{...(v('id')?{id:v('id')}:{}),expectedRevision:Number(v('expectedRevision')),site});await refresh();}
  else if(form.id==='request-form'){const site=state.sites.find(s=>s.id===v('siteId')),q=await api('/api/requests',{siteId:site.id,siteRevision:site.revision,title:v('title'),request:{family:v('family'),model:v('model'),startDate:v('startDate'),endDate:v('endDate'),variables:f.getAll('variables'),units:{temperature:v('temperature'),wind:v('wind'),precipitation:v('precipitation')}}});requestId=q.id;await refresh();}
  else if(form.id==='prepare-form'){const q=selected();await start('prepare',{requestId:q.id,args:{expectedRevision:q.revision,maxAtomic:v('maxAtomic'),acceptIndex:Number(v('acceptIndex')),directEvaluation:f.has('directEvaluation')}});}
  else if(form.id==='decision-form'){const decision={title:v('title'),owner:v('owner'),disposition:v('disposition'),notes:v('notes'),rule:{variable,unit:sourceView.series.unit,startUtc:v('startUtc'),endUtc:v('endUtc'),aggregation:v('aggregation'),operator:v('operator'),threshold:Number(v('threshold')),minimumCoverage:Number(v('minimumCoverage'))}};await api('/api/decisions',{...(decisionEdit?{id:decisionEdit.id,expectedRevision:decisionEdit.revision}:{}),captureId,decision});decisionEdit=null;await refresh();}
  else if(form.id==='report-form'){await api('/api/reports',{title:v('title'),owner:v('owner'),notes:v('notes'),decisions:f.getAll('decision').map(id=>({id,revision:state.decisions.find(d=>d.id===id).revision}))});await refresh();}
  else if(form.id==='compare-form'){comparison=await api('/api/compare?left='+captureId+'&right='+encodeURIComponent(v('right'))+'&variable='+variable);$('#comparison').innerHTML='<div class="metrics"><div><strong>'+comparison.overlappingTimestamps+'</strong>Identical UTC timestamps</div><div><strong>'+num(comparison.meanAbsoluteDifference)+'</strong>Mean absolute difference, '+esc(comparison.unit)+'</div></div><p class="muted">'+esc(comparison.alignment)+'</p>';}
  else if(form.id==='snapshot-form')await start('recovery-snapshot',{args:{output:v('output'),passphraseEnv:v('passphraseEnv')}});
  else if(form.id==='verify-form')await start('recovery-verify',{args:{bundle:v('bundle'),expectedRecordSha256:v('expectedRecordSha256'),passphraseEnv:v('passphraseEnv')}});
 }catch(e){error(e);}finally{if(submit&&submit.isConnected)submit.disabled=false;}
});
await refresh().catch(error);renderJob(await api('/api/job').catch(()=>null));if(lastJob?.state==='RUNNING')poll();
