// MIT. Original Forecast financing options, complete working copies and explicit adoption.
import {signature} from './forecast-workbook.mjs';
import {newFinancingState,validateFinancingState,verifyFinancingState,captureFinancingOption,financingRequest,retainFinancingComparison,financingComparisonCurrent,financingChanges,financingMetrics,financingMoneyDelta,financingCsv,completeFinancingSources,financingFile,receiveFinancingFile,financingSource,financingSha} from './forecast-financing.mjs';
const clone=v=>JSON.parse(JSON.stringify(v));
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>v===null||v===undefined?'Unresolved':'USD '+v;
const time=()=>new Date().toISOString();
const uuid=p=>p+'-'+crypto.randomUUID();
const btn=(title,action,extra='')=>'<button type="button" data-financing-action="'+action+'" '+extra+'>'+esc(title)+'</button>';
function download(body,name,type='application/json'){const url=URL.createObjectURL(new Blob([body],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
function table(headers,rows){return '<div class="financing-scroll"><table><thead><tr>'+headers.map(h=>'<th scope="col">'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(v=>'<td>'+v+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';}
function shown(v){return v===null?'Not entered':typeof v==='object'?JSON.stringify(v):String(v);}
export function mountForecastFinancing({container,getCurrent,getEditor,api,available=()=>true,isBlocked=()=>false,onBusy=()=>{},onStateChange=()=>{},persist,onApply,onCase,mutationId,recordingActor,initialState=null}){
  if(!document.querySelector('link[data-forecast-financing-style]')){const link=document.createElement('link');link.rel='stylesheet';link.href='/forecast-financing.css';link.dataset.forecastFinancingStyle='true';document.head.append(link);}
  let active=true,busy=false,s=initialState?validateFinancingState(initialState,getCurrent()):newFinancingState(getCurrent()),proposal=null,tab='options',page=0,query='',detailId=null,dayPage=0;
  const root=document.createElement('section');root.className='forecast-financing';container.replaceChildren(root);
  const live=()=>active&&available()&&root.isConnected;
  const block=()=>busy||isBlocked();
  const currentComparison=()=>s.comparisons.find(c=>c.id===s.selectedComparisonId)||null;
  function status(message,error=false){if(!live())return;const n=root.querySelector('[data-financing-status]');if(n){n.textContent=message;n.setAttribute('role',error?'alert':'status');}}
  function changed(){s.revision++;if(live())onStateChange(clone(s));}
  function touch(){if(live())onStateChange(clone(s));}
  function original(){if(!live())throw Error('Reopen the original Forecast to continue this study.');}
  function setHostBusy(){if(!live())return;root.setAttribute('aria-busy',String(busy));for(const n of root.querySelectorAll('input,select,textarea,button')){const action=n.dataset.financingAction,recovery=['download-local','resume-source','download-csv'].includes(action);n.disabled=busy||isBlocked()&&!(recovery&&s.pendingSource)||n.dataset.fixed==='true';}}
  async function run(fn,{recovery=false}={}){if(!live()||busy||isBlocked()&&!(recovery&&s.pendingSource))return;busy=true;onBusy(true);setHostBusy();try{await fn();}catch(error){status(error.message,true);}finally{busy=false;onBusy(false);if(live()){touch();setHostBusy();}}}
  function stateGuard(){const snapshot=signature(s),version=getCurrent().program.version;return()=>{original();if(signature(s)!==snapshot||getCurrent().program.version!==version)throw Error('The study or original case changed during this operation. Current work remains intact; start the review again.');};}
  function controls(){
    const options=s.options.map(o=>'<option value="'+esc(o.id)+'"'+(s.selectedId===o.id?' selected':'')+'>'+esc(o.name)+(o.archived?' [archived]':'')+'</option>').join('');
    const comps=s.comparisons.map(c=>'<option value="'+esc(c.id)+'"'+(s.selectedComparisonId===c.id?' selected':'')+'>'+esc(c.createdAt)+' · case v'+c.result.source.version+' · '+c.result.options.length+' options</option>').join('');
    const sources=getCurrent().sources.filter(x=>/^financing-.+-r[0-9]+\.json$/.test(x.filename));
    return '<div class="financing-toolbar">'+btn('Capture current editor as option','capture')+btn('Compare active options','compare',s.options.some(x=>!x.archived)?'':'data-fixed="true"')+btn('Download complete study','download')+btn('Download retained working study','download-local')+btn('Reopen study','receive')+btn('Save study with original case','save-source')+(s.pendingSource?btn('Continue original study save','resume-source'):'')+'</div>'+
      '<input hidden type="file" data-financing-file accept=".json,application/json">'+
      '<div class="financing-fields"><label>Study title<input data-financing-field="title" maxlength="200" value="'+esc(s.title)+'"></label><label>New or replacement option name<input data-financing-field="nameDraft" maxlength="200" value="'+esc(s.nameDraft)+'" placeholder="For example: award delayed 30 days"></label>'+
      '<label class="financing-wide">Option capture note<textarea data-financing-field="noteDraft">'+esc(s.noteDraft)+'</textarea></label><label class="financing-wide">Study decision and source note<textarea data-financing-field="note">'+esc(s.note)+'</textarea></label>'+
      '<label>Selected option<select data-financing-select="option"><option value="">Choose an option</option>'+options+'</select></label><label>Comparison edition<select data-financing-select="comparison"><option value="">No comparison selected</option>'+comps+'</select></label>'+
      '<label>Saved study in this case<select data-financing-select="source"><option value="">Choose a retained study</option>'+sources.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.filename)+' · '+esc(x.sha256.slice(0,12))+'</option>').join('')+'</select></label>'+btn('Reopen selected saved study','receive-source')+'</div>';
  }
  function optionRows(){
    const rows=s.options.filter(o=>!query||[o.name,o.note,JSON.stringify(o.capture.inputs)].join(' ').toLowerCase().includes(query.toLowerCase()));
    return '<div class="financing-toolbar"><label>Find options<input data-financing-search value="'+esc(query)+'"></label>'+btn('Previous options','previous',page?'':'data-fixed="true"')+btn('Next options','next',(page+1)*8<rows.length?'':'data-fixed="true"')+'<span>'+rows.length+' options · page '+(page+1)+'</span></div>'+
      table(['Option','Source and history','Actions'],rows.slice(page*8,page*8+8).map(o=>[
      '<strong>'+esc(o.name)+'</strong><p>'+esc(o.note)+'</p><span>'+esc(o.archived?'Archived; retained in history':'Active')+'</span>',
      'Captured case v'+o.capture.caseVersion+'<br>'+esc(o.capture.capturedAt)+'<br>'+o.previous.length+' earlier captures',
      btn('Review in editor','review-edit','data-option="'+esc(o.id)+'"')+btn('Review calculated adoption','review-calculated','data-option="'+esc(o.id)+'"')+btn('Replace from current editor','replace','data-option="'+esc(o.id)+'"')+btn('Duplicate','duplicate','data-option="'+esc(o.id)+'"')+btn(o.archived?'Restore option':'Archive option','archive','data-option="'+esc(o.id)+'"')+btn('Inspect complete option','inspect','data-option="'+esc(o.id)+'"')
    ]))+(rows.length?'':'<p>No options yet. Capture the original editor, change its actual assumptions, and capture a second named option.</p>');
  }
  function comparisonHtml(){
    const c=currentComparison();if(!c)return '<p>No calculated comparison yet. Complete each option in the original editor, then compare the active options together.</p>';
    let current=false;try{current=financingComparisonCurrent(s,getCurrent());}catch{}
    const base=c.result.options.find(o=>o.id===s.baselineId)||c.result.options[0],bm=financingMetrics(base.preview);
    return '<div class="financing-basis"><strong>'+(current?'Current source and captured options':'Historical comparison — recalculate before adopting')+'</strong><p>Original case v'+c.result.source.version+' · '+esc(c.createdAt)+' · '+c.result.options.length+' complete options. All money below is USD. Missing amounts remain unresolved. Required starting cash and the extra gap after known opening cash are different measures.</p><p>Costs, conditional receipts, source evidence and customer-fund protection retain the original Forecast semantics. A smaller modeled gap does not establish an award, collection, or accepted customer term.</p></div>'+
      '<label>Delta reference<select data-financing-select="baseline">'+c.result.options.map(o=>'<option value="'+esc(o.id)+'"'+(o.id===base.id?' selected':'')+'>'+esc(o.name)+'</option>').join('')+'</select></label>'+
      table(['Option','Grant-only starting need','Combined starting need / change','Extra gap after opening','Customer funds protected','Capacity / unresolved decisions'],c.result.options.map(o=>{const m=financingMetrics(o.preview);return [
        '<strong>'+esc(o.name)+'</strong><br><small>As of '+esc(o.preview.inputs.asOfDate)+' · '+esc(o.preview.report.firstForecastDate)+' through '+esc(o.preview.report.lastForecastDate)+'</small>'+btn('Inspect report and assumptions','detail','data-option="'+esc(o.id)+'"')+btn('Review adoption','review-calculated','data-option="'+esc(o.id)+'"'),
        esc(money(m.grantNeed)),esc(money(m.combinedNeed))+'<br><small>Change: '+esc(money(financingMoneyDelta(bm.combinedNeed,m.combinedNeed)))+' · peak '+esc(m.combinedPeak||'unresolved')+'</small>',
        esc(money(m.combinedGap))+'<br><small>End cash: '+esc(money(m.endBalance))+'</small>',
        m.protectedEnabled?'Starting need '+esc(money(m.protectedNeed))+'<br>Extra gap '+esc(money(m.protectedGap)):'Protection not enabled for this option',
        esc(m.peakWeekly)+' h/week equivalent<br>Available '+esc(m.weeklyHours??'not entered')+'<br>'+m.overloadedDays+' overloaded days · '+m.issueCount+' issues'+(!m.currencyComplete?'<br>Incomplete currency valuation':'')
      ];}))+'<div class="financing-toolbar">'+btn('Download comparison CSV','download-csv')+btn('Inspect full comparison JSON','comparison-json')+'</div>';
  }
  function detailsHtml(){
    const c=currentComparison(),o=c?.result.options.find(x=>x.id===detailId);
    if(!o)return '';
    const r=o.preview.report,base=c.result.options.find(x=>x.id===s.baselineId)||c.result.options[0],changes=financingChanges(base.preview.inputs,o.preview.inputs),days=r.days;
    return '<details open class="financing-details"><summary>'+esc(o.name)+' — complete original calculated report</summary>'+
      '<p>'+esc(r.basis)+'</p><p>'+esc(r.capacity.distribution)+'</p>'+
      '<h5>Assumption differences from '+esc(base.name)+'</h5>'+table(['Original field','Reference','This option'],changes.map(x=>[esc(x.path),esc(shown(x.before)),esc(shown(x.after))]))+
      '<h5>Original unresolved source and date decisions</h5><pre>'+esc(JSON.stringify(r.issues,null,2))+'</pre>'+
      '<h5>Dated cash</h5><div class="financing-toolbar">'+btn('Previous dates','day-prev',dayPage?'':'data-fixed="true"')+btn('Next dates','day-next',(dayPage+1)*30<days.length?'':'data-fixed="true"')+'<span>'+days.length+' dates · page '+(dayPage+1)+'</span></div>'+
      table(['Date','Combined cash change','Available cash','Customer collections','Customer cost','Work hours'],days.slice(dayPage*30,dayPage*30+30).map(d=>[esc(d.date),esc(money(d.commercialDeltaUsd)),esc(money(d.commercialBalanceUsd)),esc(money(d.forecastCustomerInflowUsd)),esc(money(d.commercialOutflowUsd)),esc(d.remainingWorkHours)]))+
      '<details><summary>Complete original result and source identity</summary><pre>'+esc(JSON.stringify(o.preview,null,2))+'</pre></details></details>';
  }
  function proposalHtml(){
    if(!proposal)return '';
    const changes=financingChanges(proposal.before.inputs,proposal.after.inputs);
    return '<section class="financing-review" role="region" aria-label="Review option adoption"><h5>Review '+esc(proposal.name)+' in the original editor</h5><p>'+
      (proposal.comparisonId?'This uses the selected native comparison and its normalized inputs.':'This restores the captured option including unfinished raw fields. Complete the original native preview before saving.')+
      ' The displaced editor is retained in the complete previous working file; all workbook and cash-review evidence remains retained.</p>'+table(['Field','Current editor','Selected option'],changes.map(x=>[esc(x.path),esc(shown(x.before)),esc(shown(x.after))]))+
      '<details><summary>Exact retained raw control values</summary><pre>'+esc(JSON.stringify(proposal.after.rawFields,null,2))+'</pre></details>'+btn('Adopt reviewed option into editor','apply')+btn('Keep current editor','cancel-apply')+'</section>';
  }
  function render(){
    if(!live())return;
    root.innerHTML='<details open><summary><strong>Financing options</strong></summary><p>Prepare, compare and choose complete financing plans in the original Forecast. Capture the editor before changing a milestone date, customer selection, cost, capacity, currency or cash attribution.</p><p data-financing-status role="status" aria-live="polite">'+esc(s.message)+'</p>'+controls()+
      '<nav class="financing-toolbar">'+btn('Prepared options','tab-options')+btn('Calculated comparison','tab-comparison')+'</nav>'+(tab==='options'?optionRows():comparisonHtml()+detailsHtml())+proposalHtml()+
      '<details><summary>Retained decisions and study saves</summary><pre>'+esc(JSON.stringify({adoptions:s.adoptions,sourceReceipts:s.sourceReceipts,pendingSource:s.pendingSource?{stage:s.pendingSource.stage,requestId:s.pendingSource.request.requestId,expectedVersion:s.pendingSource.request.expectedVersion}:null},null,2))+'</pre></details>'+
      '<p><a href="/FORECAST_FINANCING.md" target="_blank" rel="noopener">Read the complete operating guide</a>. The complete original case export retains native financial records and source attachments.</p></details>';
    setHostBusy();
  }
  function editorCapture(){const e=getEditor();return {inputs:clone(e.inputs),rawFields:clone(e.rawFields),capturedAt:time(),caseVersion:getCurrent().program.version};}
  async function bytes(meta){const response=await api('/api/operations/'+getCurrent().program.id+'/sources/'+meta.id,undefined,{download:true});return new Uint8Array(await response.arrayBuffer());}
  async function verifyNativeSources(candidate){
    const current=getCurrent();
    for(const c of candidate.comparisons)for(const src of c.context.sources){const actual=current.sources.find(x=>x.id===src.id);if(!actual||actual.sha256!==src.sha256||actual.bytes!==src.bytes)throw Error('This case lacks an original study source: '+src.filename+'. Reopen the complete original case before receiving the study.');}
  }
  async function receive(value){
    const check=stateGuard(),candidate=await receiveFinancingFile(value,getCurrent());await verifyNativeSources(candidate);check();
    // Import replaces this desk only after complete validation; first download keeps the current edition.
    if(s.options.length||s.comparisons.length)download(JSON.stringify({schema:'stellar-forge.forecast-financing.v1.file',sourceMode:'CASE_RETAINED',exportedAt:time(),study:s},null,2)+'\n',s.id+'-before-receive.json');
    s=candidate;proposal=null;page=0;detailId=null;touch();render();await persist();status('Reopened all options, captures, comparisons and exact source identities.');
  }
  async function finishSource(){
    let j=s.pendingSource;if(!j)throw Error('No original study save is pending.');
    await verifyFinancingState(s,getCurrent());original();
    if(j.stage==='PENDING'){
      let result;try{result=await api('/api/operations/'+getCurrent().program.id+'/command',clone(j.request));}
      catch(error){
        if(Number.isInteger(error.status)&&error.status>=400&&error.status<500&&![401,403,408,425,429].includes(error.status)){
          s.sourceReceipts.push({status:'REJECTED',filename:j.source.filename,sha256:j.source.sha256,at:time(),request:clone(j.request),error:{status:error.status,code:error.code||'',message:error.message}});
          s.pendingSource=null;changed();await persist();
          const next=await api('/api/operations/'+getCurrent().program.id);original();onCase(next);render();
        }throw error;
      }
      original();if(!/^source-[a-f0-9]{32}$/.test(result?.recordId||'')||!Number.isSafeInteger(result.version))throw Error('The original source reply is incomplete. Continue the exact retained request.');
      j.receipt={id:result.recordId,version:result.version,sha256:j.source.sha256};j.stage='SAVED';touch();await persist();
    }
    const next=await api('/api/operations/'+getCurrent().program.id);original();
    const metadata=next.sources.find(x=>x.id===j.receipt.id);
    if(!metadata||metadata.sha256!==j.source.sha256||metadata.bytes!==j.source.bytes||metadata.filename!==j.source.filename)throw Error('The exact retained study is absent from the original case; keep this request for recovery.');
    onCase(next);s.sourceReceipts.push({status:'SAVED',...j.receipt,filename:j.source.filename,at:time(),requestId:j.request.requestId});s.pendingSource=null;changed();await persist();render();
    status('Saved the complete study as an original case source. The comparison remains pinned to its earlier source version; recalculate before adopting or saving a Forecast.');
  }
  root.addEventListener('input',event=>{
    const field=event.target.dataset.financingField;if(field&&!block()){s[field]=event.target.value;changed();}
    if(event.target.matches('[data-financing-search]')&&!block()){query=event.target.value;page=0;/* Preserve typing focus; results refresh on change. */}
  });
  root.addEventListener('change',event=>{
    if(block())return;
    if(event.target.matches('[data-financing-search]')){render();return;}
    const type=event.target.dataset.financingSelect;
    if(type==='option'){s.selectedId=event.target.value||null;changed();}
    if(type==='baseline'){s.baselineId=event.target.value||null;changed();render();}
    if(type==='comparison'){s.selectedComparisonId=event.target.value||null;detailId=null;dayPage=0;changed();render();}
    if(event.target.matches('[data-financing-file]')){const file=event.target.files?.[0];if(!file)return;void run(async()=>{if(file.size>256*1024*1024)throw Error('Choose the complete study within 256 MiB.');const check=stateGuard(),raw=await file.text();check();await receive(JSON.parse(raw));});}
  });
  root.addEventListener('click',event=>{
    const target=event.target.closest('[data-financing-action]');if(!target)return;event.preventDefault();const action=target.dataset.financingAction,id=target.dataset.option||s.selectedId;
    if(action==='download-local'&&!busy){download(JSON.stringify({schema:'stellar-forge.forecast-financing.v1.file',sourceMode:'CASE_RETAINED',exportedAt:time(),study:s},null,2)+'\n',s.id+'-working.json');status('Downloaded all retained options and pending requests without requiring a storage write. Complete source attachments are included where previously received.');return;}
    if(block()&&!(action==='resume-source'&&s.pendingSource&&!busy))return;
    if(action==='receive'){const file=root.querySelector('[data-financing-file]');file.value='';file.click();return;}
    if(action==='tab-options'||action==='tab-comparison'){tab=action==='tab-options'?'options':'comparison';render();return;}
    if(['previous','next','day-prev','day-next'].includes(action)){if(action==='previous')page=Math.max(0,page-1);if(action==='next')page++;if(action==='day-prev')dayPage=Math.max(0,dayPage-1);if(action==='day-next')dayPage++;render();return;}
    if(action==='detail'){detailId=id;dayPage=0;tab='comparison';render();return;}
    if(action==='cancel-apply'){proposal=null;render();return;}
    if(action==='download-csv'){try{download(financingCsv(s),s.id+'-comparison.csv','text/csv;charset=utf-8');}catch(error){status(error.message,true);}return;}
    if(action==='comparison-json'){const c=currentComparison();if(c)download(JSON.stringify(c,null,2)+'\n',c.id+'.json');return;}
    void run(async()=>{
      if(action==='capture'||action==='replace'){
        const o=s.options.find(x=>x.id===id),name=s.nameDraft.trim()||(action==='replace'?o?.name:'');
        if(!name)throw Error('Name the complete option before capturing it.');
        s=captureFinancingOption(s,getCurrent(),editorCapture(),{replaceId:action==='replace'?id:null,name,note:s.noteDraft});proposal=null;touch();render();await persist();status('Captured complete original inputs and unfinished control values.');return;
      }
      if(action==='duplicate'){const o=s.options.find(x=>x.id===id);if(!o)throw Error('Select an original option.');s=captureFinancingOption(s,getCurrent(),clone(o.capture),{name:(s.nameDraft.trim()||o.name+' — copy').slice(0,200),note:o.note});touch();render();await persist();return;}
      if(action==='archive'){const o=s.options.find(x=>x.id===id);if(!o)throw Error('Select an original option.');if(o.archived&&s.options.filter(x=>!x.archived).length>=24)throw Error('Keep at most 24 active options.');o.archived=!o.archived;changed();render();await persist();return;}
      if(action==='inspect'){const o=s.options.find(x=>x.id===id);if(o)download(JSON.stringify(o,null,2)+'\n',o.id+'.json');return;}
      if(action==='compare'){
        const check=stateGuard(),current=clone(getCurrent()),request=financingRequest(s,current);
        const result=await api('/api/operations/'+current.program.id+'/forecast-options-preview',request);check();
        const next=await retainFinancingComparison(s,current,request,result);check();s=next;tab='comparison';detailId=null;touch();render();await persist();status('Calculated every active option using one original case snapshot. No financial record was written.');return;
      }
      if(action==='review-edit'||action==='review-calculated'){
        const o=s.options.find(x=>x.id===id);if(!o)throw Error('Select an original option.');
        let after=clone(o.capture),comparisonId=null;
        if(action==='review-calculated'){const c=currentComparison();if(!c||!financingComparisonCurrent(s,getCurrent()))throw Error('Recalculate all active options against the current original case before adopting a calculated result.');const row=c.result.options.find(x=>x.id===id);if(!row)throw Error('The option is absent from this comparison.');after={inputs:clone(row.preview.inputs),rawFields:{},capturedAt:time(),caseVersion:getCurrent().program.version};comparisonId=c.id;}
        proposal={optionId:id,name:o.name,before:editorCapture(),after,comparisonId,stateSignature:signature(s),caseVersion:getCurrent().program.version};render();return;
      }
      if(action==='apply'){
        if(!proposal)throw Error('Review a complete option first.');
        const current=editorCapture();if(signature(s)!==proposal.stateSignature||getCurrent().program.version!==proposal.caseVersion||signature(current.inputs)!==signature(proposal.before.inputs)||signature(current.rawFields)!==signature(proposal.before.rawFields))throw Error('The current draft, option or case changed after review. Review the complete current values again.');
        const selection=clone(proposal),candidate=clone(s);candidate.adoptions.push({at:time(),optionId:selection.optionId,comparisonId:selection.comparisonId,before:selection.before,after:selection.after});candidate.revision++;selection.state=candidate;
        const result=await onApply(selection);if(result?.adopted&&live()){s=candidate;proposal=null;touch();status('Adopted the reviewed option into the original editor. Use its original native preview and save.');}return;
      }
      if(action==='download'){const check=stateGuard(),next=await completeFinancingSources(s,getCurrent(),bytes);check();s=next;touch();const file=await financingFile(s,getCurrent());original();download(JSON.stringify(file,null,2)+'\n',s.id+'-complete.json');await persist();status('Downloaded all options, native comparisons, original context and exact original source bytes.');return;}
      if(action==='receive-source'){const id=root.querySelector('[data-financing-select=source]').value,meta=getCurrent().sources.find(x=>x.id===id);if(!meta)throw Error('Choose a saved study in this original case.');const check=stateGuard(),raw=await bytes(meta);if(await financingSha(raw)!==meta.sha256||raw.length!==meta.bytes)throw Error('The saved study differs from its source identity.');check();await receive(JSON.parse(new TextDecoder().decode(raw)));return;}
      if(action==='save-source'){
        if(s.pendingSource)throw Error('Continue the exact retained study source request first.');if(getCurrent().program.state==='CLOSED')throw Error('Reopen the original case before saving a study source.');if(!s.note.trim())throw Error('Enter a study decision/source note before retaining it in the original case.');
        const check=stateGuard(),source=await financingSource(s,getCurrent());check();const current=getCurrent();
        if(current.sources.length>=200||current.sources.reduce((n,x)=>n+x.bytes,0)+source.bytes>24*1024*1024)throw Error('The original case source allowance is full. Download the study intact and use the original case source workflow.');
        const startedAt=time(),request={expectedVersion:current.program.version,actor:recordingActor(),note:s.note,action:'source.add',data:{filename:source.filename,contentBase64:source.dataBase64,kind:'other',mediaType:source.mediaType,sourceUrl:'',observedAt:startedAt}};
        request.requestId=await mutationId('forecast-financing:'+current.program.id,request);check();
        s.pendingSource={stage:'PENDING',source,request,receipt:null,startedAt};changed();await persist();original();await finishSource();return;
      }
      if(action==='resume-source'){await persist();await finishSource();return;}
    },{recovery:action==='resume-source'});
  });
  render();
  return {snapshot:()=>clone(s),setHostBusy,dispose(){active=false;},root};
}
