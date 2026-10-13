// MIT. Recurring customer-close choices in the original local workbench.
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const when=v=>v?new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'}).format(new Date(v))+' UTC':'—';
const labels={UPCOMING:'Upcoming',READY:'Period ended',DUE:'Due today',OVERDUE:'Overdue',ASSIGNMENT_CHANGED:'Assignment changed',EXACT_CAPTURES_AVAILABLE:'Exact captures available',CHOOSE_CAPTURES:'Choose actual captures'};
const download=(value,name,type='application/json')=>{
  const url=URL.createObjectURL(new Blob([typeof value==='string'?value:JSON.stringify(value,null,2)+'\n'],{type}));
  const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
};
const options=(rows,selected,label,empty='Choose…')=>'<option value="">'+esc(empty)+'</option>'+rows.map(r=>'<option value="'+esc(r.id)+'"'+(r.id===selected?' selected':'')+'>'+esc(label(r))+'</option>').join('');
export function createServiceSchedulesUi({getState,api,notice,showError,clearError,openReview,openCycle,showPlanner}){
  const state={catalogue:null,calendar:null,definitionId:null,selected:[],plan:null,requestId:crypto.randomUUID(),pending:null,pendingDraft:null,
    busy:false,offset:0,historyOffset:0,history:null,scope:null};
  $('service-schedules-view').innerHTML=
    '<div class="page-heading"><div><h1 id="service-schedules-title">Service calendars</h1><p>Save recurring customer periods, choose their actual source captures and continue through the original closing cycle.</p></div><button id="schedule-refresh" type="button">Refresh calendars and service history</button></div>'+
    '<section class="panel"><div class="section-heading"><h2>Saved calendars</h2><button id="schedule-new" type="button">New calendar</button></div><div id="schedule-definitions" class="table-wrap"></div>'+
    '<details id="schedule-edit" open><summary>Calendar settings</summary><form id="schedule-form"><div class="service-toolbar">'+
    '<label>Calendar name<input id="schedule-name" maxlength="200" required></label><label>Customer and purchased pass<select id="schedule-pass" required></select></label>'+
    '<label>First opening date (UTC)<input id="schedule-anchor" type="date" required></label><label>Recurrence<select id="schedule-cadence"><option value="monthly">Months</option><option value="weekly">Weeks</option></select></label>'+
    '<label>Every<input id="schedule-interval" type="number" min="1" max="52" value="1" required></label><label>Days after close until due<input id="schedule-due" type="number" min="0" max="365" value="0" required></label>'+
    '<label>Final service date (optional, UTC)<input id="schedule-end" type="date"></label></div><label class="wide">Operator notes<textarea id="schedule-notes" rows="3" maxlength="4000"></textarea></label>'+
    '<label><input id="schedule-active" type="checkbox" checked> Active calendar</label><div class="actions"><button id="schedule-save" type="submit">Save calendar edition</button><button id="schedule-cancel" type="button">Clear form</button></div></form>'+
    '<p class="hint">Dates use UTC midnight. Monthly periods retain the original anchor day, clamped to each month’s final day; January 31 continues through February 28 or 29 and March 31. A final date may shorten the last period. Each save retains the preceding settings.</p></details>'+
    '<details><summary>Saved settings history</summary><div id="schedule-definition-history"></div></details></section>'+
    '<section class="panel"><div class="section-heading"><h2>Scheduled service periods</h2><span id="schedule-counts" class="muted"></span></div>'+
    '<form id="schedule-window" class="service-toolbar"><label>Window starts<input id="schedule-from" type="date" required></label><label>Window ends (exclusive)<input id="schedule-until" type="date" required></label>'+
    '<label><input id="schedule-paused" type="checkbox"> Include paused calendars</label><button type="submit">Read this window</button></form>'+
    '<p class="hint">Scheduled dates express the service calendar. Original captures define the actual statement period. Choose those files explicitly when their timestamps differ.</p>'+
    '<div id="schedule-periods" class="table-wrap"></div><div id="schedule-paging" class="actions"></div>'+
    '<div class="actions"><button id="schedule-window-html" type="button">Download readable calendar</button><button id="schedule-window-csv" type="button">Download calendar CSV</button></div></section>'+
    '<section class="panel"><div class="section-heading"><h2>Selected periods</h2><span id="schedule-selection-count"></span></div>'+
    '<label class="wide">Closing cycle name<input id="schedule-cycle-label" maxlength="200" placeholder="Monthly customer service close"></label>'+
    '<div id="schedule-selected"></div><div class="actions"><button id="schedule-clear-selected" type="button">Clear selections</button><button id="schedule-compile" type="button">Review selected customer periods</button></div></section>'+
    '<section id="schedule-plan-panel" class="panel" hidden><h2>Reviewed scheduled close</h2><div id="schedule-plan"></div>'+
    '<div class="actions"><button id="schedule-plan-download" type="button">Download complete plan</button><button id="schedule-prepare" type="button" class="primary">Prepare original closing cycle</button></div>'+
    '<p class="hint">Open the saved cycle to read and issue its original customer statements. The calendar preserves its dates alongside the actual source periods.</p></section>'+
    '<section id="schedule-pending" class="panel" hidden><h2>Original preparation</h2><p id="schedule-pending-text"></p><div class="actions"><button id="schedule-recover" type="button">Recover or continue original preparation</button><button id="schedule-request-download" type="button">Download original request</button></div></section>'+
    '<section class="panel"><div class="section-heading"><h2>Saved preparation history</h2><button id="schedule-history-refresh" type="button">Refresh history</button></div><div id="schedule-history"></div><div id="schedule-history-paging" class="actions"></div></section>'+
    '<section class="panel"><h2>Keep or receive the calendar workspace</h2><p>Export all calendar editions and their complete preparation plans. The original saved cycles remain in the closing work directory; receive those original cycle folders to continue their statements on another installation.</p>'+
    '<div class="actions"><button id="schedule-export" type="button">Download complete calendar workspace</button><label>Import complete calendar workspace<input id="schedule-import" type="file" accept=".json,application/json"></label><button id="schedule-original-planner" type="button">Open service planner and corrections</button></div></section>';
  const draftKey=()=> 'customer-service-calendars:'+getState().context.draftScope;
  const formFields=['name','pass','anchor','cadence','interval','due','end','notes','active'];
  function formDraft(){return Object.fromEntries(formFields.map(name=>[name,name==='active'?$('schedule-'+name).checked:$('schedule-'+name).value]));}
  function persist(){
    if(!state.scope)return;
    try{localStorage.setItem(draftKey(),JSON.stringify({definitionId:state.definitionId,form:formDraft(),selected:state.selected,
      requestId:state.requestId,pending:state.pending,pendingDraft:state.pendingDraft,label:$('schedule-cycle-label').value,from:$('schedule-from').value,until:$('schedule-until').value}));}
    catch{notice('Browser draft storage is full or unavailable. Download the original request or reviewed plan before leaving; saved calendars and preparation history remain in the work directory.');}
  }
  function restore(){
    const scope=getState().context.draftScope;if(state.scope===scope)return;
    state.scope=scope;const now=new Date();
    $('schedule-from').value=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-1,1)).toISOString().slice(0,10);
    $('schedule-until').value=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+3,1)).toISOString().slice(0,10);
    $('schedule-anchor').value=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1)).toISOString().slice(0,10);
    try{
      const saved=JSON.parse(localStorage.getItem(draftKey())??'null');if(!saved)return;
      state.definitionId=saved.definitionId??null;
      if(Array.isArray(saved.selected)&&saved.selected.length<=2000)state.selected=saved.selected;
      if(/^[a-f0-9-]{36}$/.test(saved.requestId??''))state.requestId=saved.requestId;
      state.pending=saved.pending??null;state.pendingDraft=typeof saved.pendingDraft==='string'?saved.pendingDraft:null;
      for(const name of formFields)if(saved.form&&typeof saved.form[name]===(name==='active'?'boolean':'string')){
        if(name==='active')$('schedule-active').checked=saved.form[name];else $('schedule-'+name).value=saved.form[name];
      }
      state.restoredPass=saved.form?.pass;
      if(saved.label)$('schedule-cycle-label').value=saved.label;
      if(saved.from)$('schedule-from').value=saved.from;if(saved.until)$('schedule-until').value=saved.until;
    }catch{}
  }
  async function run(work){if(state.busy)return;state.busy=true;clearError();buttons();try{await work();}catch(error){showError(error);}finally{state.busy=false;buttons();}}
  function buttons(){$('service-schedules-view').inert=state.busy;$('service-schedules-view').setAttribute('aria-busy',String(state.busy));for(const id of ['schedule-save','schedule-refresh','schedule-compile','schedule-prepare','schedule-recover'])$(id).disabled=state.busy;
    $('schedule-compile').disabled=state.busy||!state.selected.length;$('schedule-prepare').disabled=state.busy||!state.plan||Boolean(state.pending);}
  function changed(){state.plan=null;$('schedule-plan-panel').hidden=true;if(!state.pending)state.requestId=crypto.randomUUID();persist();buttons();}
  function renderDefinitions(){
    const current=state.catalogue.current;
    $('schedule-definitions').innerHTML=current.length?'<table><thead><tr><th>Calendar</th><th>Recurrence and opening</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody>'+
      current.map(d=>'<tr><td>'+esc(d.name)+'<small>'+esc(d.orderRef)+'</small></td><td>Every '+d.interval+' '+esc(d.cadence==='monthly'?'month(s)':'week(s)')+' from '+esc(d.anchor)+'</td><td>'+d.dueDays+' day(s) after close</td><td>'+esc(d.active?'Active':'Paused')+'</td><td><button type="button" data-schedule-edit="'+d.id+'">Edit saved settings</button></td></tr>').join('')+'</tbody></table>':'<p>No service calendars saved. Choose an assigned customer pass to create the first one.</p>';
    $('schedule-definition-history').innerHTML=state.catalogue.definitions.map(d=>'<details><summary>'+esc(d.versions.at(-1).name)+' · '+d.versions.length+' edition(s)</summary><pre>'+esc(JSON.stringify(d.versions,null,2))+'</pre></details>').join('');
    const selected=state.restoredPass??$('schedule-pass').value;state.restoredPass=null;
    const editing=current.find(definition=>definition.id===state.definitionId);
    const rows=[...state.calendar.inventory.rows];
    for(const definition of current){const id=definition.bindingId+':'+definition.periodIdentitySha256;
      const position=rows.findIndex(row=>row.id===id),available=position>=0&&rows[position].customer.id===definition.customerId;
      if(!available){const unavailable={id,customer:{id:definition.customerId,name:definition.name},planLabel:'Original assignment unavailable — pause or choose a new calendar',pass:{orderRef:definition.orderRef}};
        if(position<0)rows.push(unavailable);else if(editing?.id===definition.id)rows[position]=unavailable;}}

    $('schedule-pass').innerHTML=options(rows,selected,row=>row.customer.name+' · '+row.planLabel+' · '+row.pass.orderRef,'Choose original assigned pass');
  }
  function windowArgs(){return {from:$('schedule-from').value,until:$('schedule-until').value,includePaused:$('schedule-paused').checked,offset:state.offset,limit:25};}
  async function refresh(){restore();const [catalogue,calendar]=await Promise.all([api('/api/service-schedules/catalogue'),api('/api/service-schedules/calendar',windowArgs())]);
    state.catalogue=catalogue;state.calendar=calendar;renderDefinitions();renderPeriods();renderSelected();renderPending();await refreshHistory();persist();
    notice('Saved calendars and actual customer service history refreshed.');}
  function renderPeriods(){
    const value=state.calendar;$('schedule-counts').textContent=value.total+' periods · '+value.counts.due+' due without a current statement · '+value.counts.current+' with a current statement';
    $('schedule-periods').innerHTML=value.items.length?'<table><thead><tr><th>Calendar and customer</th><th>Scheduled period</th><th>Due / source</th><th>Existing work</th><th></th></tr></thead><tbody>'+
      value.items.map(p=>'<tr><td>'+esc(p.name)+'<small>'+esc(p.customer.name)+(p.active?'':' · Paused')+'</small></td><td>'+esc(p.from)+' to '+esc(p.until)+'</td><td>'+esc(labels[p.timing])+'<small>'+esc(when(p.dueAt))+'<br>'+esc(labels[p.sourceState])+'</small></td><td>'+
        p.currentStatements.map(s=>'<p>Statement '+esc(s.number)+'<small>'+esc(when(s.from))+' to '+esc(when(s.until))+'</small></p>').join('')+
        p.preparations.map(r=>'<button type="button" data-schedule-cycle="'+esc(r.requestId)+'">'+esc(r.label)+'</button>').join('')+
        '</td><td><button type="button" data-schedule-add="'+esc(p.id)+'"'+(!p.rowId||p.preparations.length||p.currentStatements.length||state.selected.some(s=>s.period.id===p.id)?' disabled':'')+'>Select period</button></td></tr>').join('')+'</tbody></table>':'<p>No saved periods intersect this window.</p>';
    $('schedule-paging').innerHTML='<button type="button" data-schedule-page="'+Math.max(0,state.offset-25)+'"'+(!state.offset?' disabled':'')+'>Previous periods</button><span>'+(value.total?state.offset+1:0)+'–'+(state.offset+value.items.length)+' of '+value.total+'</span><button type="button" data-schedule-page="'+value.nextOffset+'"'+(value.nextOffset===null?' disabled':'')+'>Next periods</button>';
  }
  function renderSelected(){
    $('schedule-selection-count').textContent=state.selected.length+' selected periods';
    $('schedule-selected').innerHTML=state.selected.map((selected,index)=>{
      const p=selected.period,row=state.calendar?.inventory.rows.find(r=>r.id===p.rowId);
      if(!row)return '<p>'+esc(p.name)+': its original customer assignment is unavailable. Refresh or remove this selection. <button type="button" data-schedule-remove="'+index+'">Remove</button></p>';
      return '<article class="panel"><div class="section-heading"><h3>'+esc(p.name)+' · '+esc(p.from)+' to '+esc(p.until)+'</h3><button type="button" data-schedule-remove="'+index+'">Remove</button></div>'+
        '<p>'+esc(row.customer.name)+' · '+esc(row.planLabel)+'</p><div class="service-toolbar">'+
        '<label>Completed accounting run<select data-schedule-choice="'+index+'" data-field="runId">'+options(state.calendar.inventory.runs,selected.runId,r=>(r.name||'Accounting run')+' · '+when(r.completedAt))+'</select></label>'+
        ['usageOpeningId','usageId'].map((field,i)=>'<label>'+['Actual opening capture','Actual closing capture'][i]+'<select data-schedule-choice="'+index+'" data-field="'+field+'">'+options(row.captures,selected[field],c=>(c.name||'Capture')+' · '+when(c.sourceCreatedAt)+' · '+c.id.slice(-8))+'</select></label>').join('')+'</div>'+
        '<label><input type="checkbox" data-schedule-choice="'+index+'" data-field="acceptDifferentBoundaries"'+(selected.acceptDifferentBoundaries?' checked':'')+'> I reviewed and choose these actual capture times if they differ from the scheduled dates.</label></article>';
    }).join('')||'<p>Select the scheduled periods to prepare together.</p>';buttons();
  }
  function resetForm(){state.definitionId=null;if(state.catalogue&&state.calendar)renderDefinitions();$('schedule-form').reset();$('schedule-interval').value='1';$('schedule-due').value='0';$('schedule-active').checked=true;persist();}
  async function save(){
    let row=state.calendar.inventory.rows.find(r=>r.id===$('schedule-pass').value);
    const saved=state.catalogue.current.find(d=>d.id===state.definitionId);
    if(saved&&!$('schedule-active').checked&&$('schedule-pass').value===saved.bindingId+':'+saved.periodIdentitySha256)row={customer:{id:saved.customerId},binding:{id:saved.bindingId},periodIdentitySha256:saved.periodIdentitySha256,pass:{orderRef:saved.orderRef}};
    if(!row)throw Error('Choose a current original customer and pass, or pause this original unavailable assignment.');
    const definition={name:$('schedule-name').value,active:$('schedule-active').checked,customerId:row.customer.id,bindingId:row.binding.id,
      periodIdentitySha256:row.periodIdentitySha256,orderRef:row.pass.orderRef,anchor:$('schedule-anchor').value,cadence:$('schedule-cadence').value,
      interval:Number($('schedule-interval').value),dueDays:Number($('schedule-due').value),endDate:$('schedule-end').value||null,notes:$('schedule-notes').value};
    const result=await api('/api/service-schedules/save',{expectedRevision:state.catalogue.revision,id:state.definitionId,definition});
    state.definitionId=result.definition.id;await refresh();notice('Calendar edition '+result.definition.version+' saved with its earlier settings retained.');
  }
  async function compile(){
    state.plan=await api('/api/service-schedules/compile',{selections:state.selected.map(s=>({scheduleId:s.period.scheduleId,version:s.period.version,index:s.period.index,
      runId:s.runId,usageOpeningId:s.usageOpeningId,usageId:s.usageId,acceptDifferentBoundaries:Boolean(s.acceptDifferentBoundaries)}))});
    $('schedule-plan').innerHTML='<table><thead><tr><th>Customer and scheduled period</th><th>Actual source period</th><th>Review notes</th><th></th></tr></thead><tbody>'+
      state.plan.plan.rows.map((row,i)=>{const t=state.plan.targets[i];return '<tr><td>'+esc(row.customer.name)+'<small>'+esc(t.name)+' · '+esc(t.from)+' to '+esc(t.until)+'</small></td><td>'+esc(when(t.actualOpeningAt))+' to '+esc(when(t.actualClosingAt))+'</td><td>'+
        (t.boundaryDifference?'<p>Actual capture boundaries differ from the scheduled dates, as explicitly selected.</p>':'')+row.warnings.map(w=>'<p>'+esc(w.message)+'</p>').join('')+
        '</td><td><button type="button" data-schedule-preview="'+i+'">Read full native statement preview</button></td></tr>';}).join('')+'</tbody></table>';
    $('schedule-plan-panel').hidden=false;persist();buttons();notice('The complete original service plan is ready to review.');
  }
  function renderPending(){$('schedule-pending').hidden=!state.pending;if(state.pending)$('schedule-pending-text').textContent=state.pending.label+' · original request '+state.pending.requestId;buttons();}
  const selectionDraft=()=>JSON.stringify({selected:state.selected,label:$('schedule-cycle-label').value});
  async function finishPreparation(result){
    await openCycle(result.cycle.key);
    if(state.pending?.requestId===result.preparation.requestId){
      const unchanged=state.pendingDraft!==null&&state.pendingDraft===selectionDraft();
      state.pending=null;state.pendingDraft=null;state.requestId=crypto.randomUUID();
      if(unchanged){state.plan=null;state.selected=[];$('schedule-plan-panel').hidden=true;}
      persist();renderPending();renderSelected();
    }
    notice('The original closing cycle is open for complete customer review and issuing.');
  }
  async function sendPending(){
    try{return await api('/api/service-schedules/prepare',state.pending);}
    catch(error){
      if([400,409].includes(error.status)&&state.pending){
        const checked=await api('/api/service-schedules/request',{requestId:state.pending.requestId}).catch(()=>null);
        if(checked&&!checked.found){state.pending=null;state.pendingDraft=null;state.requestId=crypto.randomUUID();persist();renderPending();}
      }
      throw error;
    }
  }
  async function prepare(){
    if(state.pending)throw Error('Recover the original preparation first.');
    const label=$('schedule-cycle-label').value.trim();if(!label)throw Error('Name the closing cycle.');
    if(!state.plan)await compile();
    state.pending={requestId:state.requestId,label,scheduledPlan:state.plan};state.pendingDraft=selectionDraft();persist();renderPending();
    await finishPreparation(await sendPending());
  }
  async function recover(requestId=state.pending?.requestId){
    try{await finishPreparation(await api('/api/service-schedules/resume',{requestId}));}
    catch(error){
      if(error.code==='SERVICE_SCHEDULE_PREPARATION'&&state.pending?.requestId===requestId)
        await finishPreparation(await sendPending());
      else throw error;
    }
  }
  async function refreshHistory(){
    state.history=await api('/api/service-schedules/history',{offset:state.historyOffset,limit:25});
    $('schedule-history').innerHTML=state.history.items.map(row=>'<article><h3>'+esc(row.label)+'</h3><p>'+esc(when(row.createdAt))+' · '+row.scheduledPlan.targets.length+' periods'+(row.imported?' · Received calendar reference':'')+'</p>'+
      '<p>'+row.scheduledPlan.targets.map(t=>esc(t.name)+' '+esc(t.from)+'–'+esc(t.until)).join('; ')+'</p><button type="button" data-schedule-cycle="'+row.requestId+'">Open or continue original cycle</button></article>').join('')||'<p>No scheduled preparations saved.</p>';
    $('schedule-history-paging').innerHTML='<button type="button" data-schedule-history-page="'+Math.max(0,state.historyOffset-25)+'"'+(!state.historyOffset?' disabled':'')+'>Previous</button><span>'+state.history.total+' preparations</span><button type="button" data-schedule-history-page="'+state.history.nextOffset+'"'+(state.history.nextOffset===null?' disabled':'')+'>Next</button>';
  }
  $('schedule-refresh').onclick=()=>run(refresh);
  $('schedule-form').onsubmit=event=>{event.preventDefault();run(save);};
  $('schedule-form').oninput=persist;
  $('schedule-new').onclick=()=>{resetForm();$('schedule-edit').open=true;$('schedule-name').focus();};
  $('schedule-cancel').onclick=resetForm;
  $('schedule-window').onsubmit=event=>{event.preventDefault();state.offset=0;run(refresh);};
  $('schedule-cycle-label').oninput=changed;
  $('schedule-clear-selected').onclick=()=>{state.selected=[];changed();renderSelected();renderPeriods();};
  $('schedule-compile').onclick=()=>run(compile);
  $('schedule-prepare').onclick=()=>run(prepare);
  $('schedule-recover').onclick=()=>run(()=>recover());
  $('schedule-plan-download').onclick=()=>download(state.plan,'scheduled-service-plan-'+state.plan.sha256.slice(0,12)+'.json');
  $('schedule-request-download').onclick=()=>download(state.pending,'scheduled-service-request-'+state.pending.requestId+'.json');
  $('schedule-history-refresh').onclick=()=>run(refreshHistory);
  $('schedule-original-planner').onclick=()=>run(showPlanner);
  $('schedule-export').onclick=()=>run(async()=>download(await api('/api/service-schedules/export',{}),'customer-service-calendars.json'));
  $('schedule-import').onchange=event=>run(async()=>{
    try{const file=event.target.files?.[0];if(!file||file.size>19_000_000)throw Error('Choose a complete calendar export up to 19 MB.');
      await api('/api/service-schedules/import',{bundle:JSON.parse(await file.text()),expectedRevision:state.catalogue.revision});await refresh();notice('Complete calendar settings and preparation references received. Original cycle folders retain the customer statements.');}
    finally{event.target.value='';}
  });
  for(const format of ['html','csv'])$('schedule-window-'+format).onclick=()=>run(async()=>{
    const file=await api('/api/service-schedules/calendar',{...windowArgs(),format});download(file.content,file.filename,file.mimeType);
  });
  $('service-schedules-view').addEventListener('change',event=>{
    const target=event.target;if(!target.dataset.scheduleChoice)return;
    const selected=state.selected[Number(target.dataset.scheduleChoice)];selected[target.dataset.field]=target.type==='checkbox'?target.checked:target.value;changed();
  });
  $('service-schedules-view').addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;const d=button.dataset;
    if(d.scheduleEdit){const v=state.catalogue.current.find(x=>x.id===d.scheduleEdit);state.definitionId=v.id;renderDefinitions();
      for(const [name,value]of Object.entries({name:v.name,pass:v.bindingId+':'+v.periodIdentitySha256,anchor:v.anchor,cadence:v.cadence,interval:v.interval,due:v.dueDays,end:v.endDate??'',notes:v.notes}))$('schedule-'+name).value=value;
      $('schedule-active').checked=v.active;$('schedule-edit').open=true;persist();$('schedule-name').focus();}
    if(d.scheduleAdd){const period=state.calendar.items.find(p=>p.id===d.scheduleAdd);
      if(state.selected.length>=2000){showError(Error('A closing cycle supports at most 2,000 selected periods.'));return;}
      state.selected.push({period,runId:'',usageOpeningId:period.openingCaptureId??'',usageId:period.closingCaptureId??'',acceptDifferentBoundaries:false});changed();renderSelected();renderPeriods();}
    if(d.scheduleRemove!==undefined){state.selected.splice(Number(d.scheduleRemove),1);changed();renderSelected();renderPeriods();}
    if(d.schedulePage!==undefined){state.offset=Number(d.schedulePage);run(refresh);}
    if(d.scheduleHistoryPage!==undefined){state.historyOffset=Number(d.scheduleHistoryPage);run(refreshHistory);}
    if(d.scheduleCycle)run(()=>recover(d.scheduleCycle));
    if(d.schedulePreview!==undefined)run(async()=>openReview(await api('/api/preview',{selection:state.plan.plan.selections[Number(d.schedulePreview)]})));
  });
  window.addEventListener('pagehide',persist);
  return {async show(){await run(refresh);}};
}
