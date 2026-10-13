import {
  COHORT_DELIVERY_COMPARISON_SCHEMA, COHORT_DELIVERY_INPUT_SCHEMA,
  seedCohortDeliveryComparison, compareCohortDelivery, reopenCohortDeliveryComparison,
  exportCohortDeliveryCsv, exportCohortDeliveryHtml
} from './cohort_delivery_comparison.mjs';

const SESSION='stellar-forge.sf47-cohort-delivery-session.v1', sessions=new Map(), MAX=8*1024*1024;
const copy=value=>structuredClone(value);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const label=value=>String(value??'').replace(/([a-z])([A-Z])/g,'$1 $2').replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
const fixed=value=>value===null||value===undefined?'—':String(value);
const clean=value=>String(value||'cohort-delivery').replace(/[^A-Za-z0-9._-]+/g,'-').slice(0,100);
const btn=(title,action,attrs='',disabled=false)=>'<button type="button" data-cd-action="'+action+'" '+attrs+(disabled?' disabled data-cd-fixed="true"':'')+'>'+esc(title)+'</button>';
const table=(headers,rows)=>'<div class="cd-table"><table><thead><tr>'+headers.map(value=>'<th scope="col">'+esc(value)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(value=>'<td>'+value+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
const detail=(title,value)=>'<details><summary>'+esc(title)+'</summary><pre>'+esc(JSON.stringify(value,null,2))+'</pre></details>';
function choices(rows,selected,empty='Select…'){return '<option value="">'+esc(empty)+'</option>'+rows.map(([id,name])=>'<option value="'+esc(id)+'"'+(id===selected?' selected':'')+'>'+esc(name)+'</option>').join('');}
function stamp(value){if(!value)return '—';const date=new Date(value);return Number.isNaN(date.valueOf())?value:new Intl.DateTimeFormat('en-US',{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'}).format(date)+' UTC';}
function download(raw,name,type='application/json'){const url=URL.createObjectURL(raw instanceof Blob?raw:new Blob([raw],{type:type+';charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
function base64(raw){const bytes=new TextEncoder().encode(raw);let result='';for(let i=0;i<bytes.length;i+=8192)result+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(result);}
function decoded(raw){const bytes=Uint8Array.from(atob(raw),char=>char.charCodeAt(0));return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}
const definitive=error=>[400,409,413,422].includes(error?.status)&&typeof error?.code==='string';

export function mountCohortDelivery({container,current,saveApi,getActor,mutationId,inform=()=>{},onCaseUpdated=()=>{}}) {
  const caseId=current.program.id,prefix='/api/operations/'+encodeURIComponent(caseId),storageKey='sf47.cohort-delivery.'+caseId;
  const root=document.createElement('section');root.className='cohort-delivery';root.setAttribute('aria-label','Cohort delivery comparison');container.replaceChildren(root);
  let active=true,hostBusy=false,caseValue=current;
  if(!document.querySelector('link[data-cohort-delivery-style]')){const css=document.createElement('link');css.rel='stylesheet';css.href='/operations_cohort_delivery.css';css.dataset.cohortDeliveryStyle='true';document.head.append(css);}
  if(!sessions.has(caseId)){
    let restored;try{restored=JSON.parse(sessionStorage.getItem(storageKey)||'null');}catch{}
    const initial={schema:SESSION,caseId,input:null,report:null,pending:null,accepted:null,rejected:null,savedSourceId:null,
      selectedPlan:'',selectedReview:'',selectedSource:'',tab:'report',page:0,search:'',filter:'all',editIntent:null,notice:'',error:'',inflight:null};
    if(restored?.schema===SESSION&&restored.caseId===caseId)Object.assign(initial,restored,{report:null,inflight:null});
    sessions.set(caseId,initial);
  }
  const state=sessions.get(caseId),available=()=>active&&root.isConnected,$=selector=>root.querySelector(selector);
  if(!Array.isArray(state.parkedComparisons))state.parkedComparisons=[];
  const pending=()=>!!(state.pending||state.accepted),locked=()=>hostBusy||!!state.inflight;
  function persist(required=false){
    const {report,inflight,...retained}=state;
    try{sessionStorage.setItem(storageKey,JSON.stringify(retained));}
    catch(error){if(required)throw new Error('The complete pending comparison could not be retained in this browser. Download its JSON, free browser session space, and reopen this case before saving.');state.storageNotice='The current comparison is retained in this open tab. Download JSON to keep a copy across browser restart.';}
  }
  function controls(){if(!available())return;root.querySelectorAll('button,input,select,textarea').forEach(node=>{node.disabled=locked()||node.dataset.cdFixed==='true';});}
  async function run(task){
    if(locked())return;
    state.error='';
    const promise=(async()=>{try{await task();}catch(error){state.error=error.message||String(error);}})();
    state.inflight=promise;controls();
    try{await promise;}finally{if(state.inflight===promise)state.inflight=null;persist();if(available())render();}
  }
  function recalculate(candidate=state.input){
    if(!candidate){state.report=null;return;}
    const report=compareCohortDelivery(candidate);state.input=report.input;state.report=report;state.savedSourceId=null;state.page=0;
  }
  function requireEditable(){if(pending())throw new Error('Finish the retained save request before changing this comparison.');}
  async function readSource(meta){
    const response=await saveApi(prefix+'/sources/'+encodeURIComponent(meta.id),undefined,{download:true}),bytes=await response.arrayBuffer();
    if(bytes.byteLength>MAX)throw new Error('Select a complete source within the original 8 MiB attachment bound.');
    if(Number.isInteger(meta.bytes)&&bytes.byteLength!==meta.bytes)throw new Error('The downloaded source differs from its original byte count.');
    const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
    if(meta.sha256&&hash!==meta.sha256)throw new Error('The downloaded source differs from its original source hash.');
    return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  }
  async function refresh(){
    const next=await saveApi(prefix);
    if(next?.program?.id!==caseId)throw new Error('The selected source belongs to another Operations case.');
    caseValue=next;
    return next;
  }
  async function finishAccepted(){
    const accepted=state.accepted;if(!accepted)return;
    const next=await refresh(),result=accepted.result;
    if(result.id!==caseId||next.program.version<result.version)throw new Error('The accepted comparison has not appeared in its original case readback.');
    const meta=next.sources.find(row=>row.id===result.recordId);
    if(!meta)throw new Error('The accepted comparison source is not yet listed in the case.');
    const raw=await readSource(meta),expected=decoded(accepted.payload.data.contentBase64);
    if(raw!==expected||meta.filename!==accepted.payload.data.filename)throw new Error('The reopened source differs from the complete original save request.');
    const report=reopenCohortDeliveryComparison(JSON.parse(raw));
    state.input=report.input;state.report=report;state.savedSourceId=meta.id;state.selectedSource=meta.id;
    state.accepted=null;state.notice='Saved and reopened '+meta.filename+' in the original case history.';
    try{persist(true);}catch(error){state.accepted=accepted;throw error;}
    if(available()){await onCaseUpdated(next,result);if(available())inform('Saved the complete delivery comparison and both original source documents.');}
  }
  async function sendPending(){
    if(state.accepted)return finishAccepted();
    if(!state.pending)return;
    const retained=state.pending;persist(true);
    try{
      const result=await saveApi(prefix+'/command',retained.payload);
      state.accepted={...retained,result};state.pending=null;persist(true);
    }catch(error){
      if(definitive(error)){state.rejected={...retained,code:error.code,rejectedAt:new Date().toISOString()};state.pending=null;persist();}
      throw error;
    }
    await finishAccepted();
  }
  async function save(){
    if(pending())return sendPending();
    if(!state.input)throw new Error('Select a saved adoption plan and an original cohort review first.');
    const actor=String((await getActor())??'').trim();if(!actor)throw new Error('Enter the recording operator in Operations.');
    await refresh();if(caseValue.program.state!=='OPEN')throw new Error('Open this original Operations case before attaching a comparison edition.');
    const createdAt=new Date().toISOString(),editionId='cohort-delivery-'+crypto.randomUUID();
    const next=copy(state.input);next.recording={...next.recording,actor,createdAt,editionId};
    const report=compareCohortDelivery(next),raw=JSON.stringify(report,null,2)+'\n';
    if(new TextEncoder().encode(raw).length>MAX)throw new Error('This complete comparison exceeds one 8 MiB source attachment. Download the complete JSON and retain it with the original case export.');
    const payload={expectedVersion:caseValue.program.version,actor,action:'source.add',
      data:{kind:'other',filename:'sf47-cohort-delivery-'+editionId+'.json',contentBase64:base64(raw),mediaType:'application/json',sourceUrl:'',observedAt:createdAt},
      note:'Cohort delivery comparison: '+next.title};
    payload.requestId=await mutationId('operations:'+caseId,payload);
    state.input=next;state.report=report;state.pending={payload};persist(true);await sendPending();
  }
  function parkComparison(incoming){
    if(!state.input||state.savedSourceId||JSON.stringify(state.input)===JSON.stringify(incoming))return;
    const raw=JSON.stringify(state.input);
    if(state.parkedComparisons.some(row=>JSON.stringify(row.input)===raw))return;
    state.parkedComparisons.push({id:'navigation-'+crypto.randomUUID(),input:copy(state.input),
      savedSourceId:state.savedSourceId,selectedPlan:state.selectedPlan,selectedReview:state.selectedReview,
      retainedAt:new Date().toISOString()});
  }
  function parkedComparisons(){
    if(!state.parkedComparisons.length)return '';
    return '<section class="cd-panel"><h3>Retained comparison drafts</h3><p>Opening an original saved edition keeps the comparison you were editing here.</p>'+
      table(['Comparison','Retained','Continue'],state.parkedComparisons.map(row=>[
        esc(row.input.title),esc(stamp(row.retainedAt)),
        btn('Resume draft','resume-parked','data-id="'+esc(row.id)+'"',pending())+
        btn('Download original input','download-parked','data-id="'+esc(row.id)+'"')
      ]))+'</section>';
  }
  function openDocument(document,preserveDraft=false){
    requireEditable();
    const report=document.schema===COHORT_DELIVERY_COMPARISON_SCHEMA?reopenCohortDeliveryComparison(document):
      document.schema===COHORT_DELIVERY_INPUT_SCHEMA?compareCohortDelivery(document):null;
    if(!report)throw new Error('Open complete delivery comparison JSON or its editable source input.');
    if(report.source.programId!==caseId)throw new Error('Open the original Operations case '+report.source.programId+' for this comparison.');
    if(preserveDraft)parkComparison(report.input);
    state.input=report.input;state.report=report;state.selectedReview=report.source.reviewId;state.savedSourceId=null;state.page=0;
  }
  function pager(rows){
    const pages=Math.max(1,Math.ceil(rows.length/40));state.page=Math.max(0,Math.min(state.page,pages-1));
    return {rows:rows.slice(state.page*40,(state.page+1)*40),html:'<div class="cd-pagination">'+btn('Previous','previous','',state.page===0)+'<span>Page '+(state.page+1)+' of '+pages+' · '+rows.length+' rows</span>'+btn('Next','next','',state.page+1>=pages)+'</div>'};
  }
  function overview(){
    const r=state.report;if(!r)return '<p class="cd-empty">Choose a saved adoption plan and a frozen cohort review, then open the comparison.</p>';
    const s=r.summary;
    let rows=r.rows.filter(row=>state.filter==='all'||state.filter==='due'&&row.remainingDue>0||state.filter==='late'&&row.lateAfterPlan>0||state.filter==='adjusted'&&(row.refunded||row.cancelledAfterSettlement));
    if(state.search.trim()){const q=state.search.toLowerCase();rows=rows.filter(row=>[row.id,row.label,row.buyerId,row.operationId,...row.intentIds].join(' ').toLowerCase().includes(q));}
    const page=pager(rows);
    return '<div class="cd-metrics">'+[['Planned paid purchases',s.plannedPaidPurchases],['Recorded cohort completions',s.observedComplete],['Independent completions',s.observedIndependentComplete],['Due remaining',s.remainingDue],['Unmatched intents',s.unmatchedIntents],['Delivered after planned time',s.lateAfterPlan]].map(([k,v])=>'<div><span>'+esc(k)+'</span><strong>'+v+'</strong></div>').join('')+'</div>'+
      '<p>'+s.plannedUsefulTasks+' useful tasks are retained in the adoption plan. Purchase, request and task-use units keep their original meanings. The cohort review supplies the recorded completion classifications.</p>'+
      '<div class="cd-tools"><label>Search opportunities<input data-cd-field="search" value="'+esc(state.search)+'" placeholder="Customer, operation or original identity"></label><label>Show<select data-cd-field="filter">'+[['all','All opportunities'],['due','Due with remaining work'],['late','Delivered late'],['adjusted','Refunded or canceled']].map(([id,name])=>'<option value="'+id+'"'+(state.filter===id?' selected':'')+'>'+name+'</option>').join('')+'</select></label></div>'+
      table(['Opportunity','UTC date','Planned completions','Recorded / independent','Due remaining','Late','State'],page.rows.map(row=>[
        '<strong>'+esc(row.label)+'</strong><small>'+esc(row.id)+'</small>',esc(row.date),row.plannedCompletePurchases,row.observedComplete+' / '+row.observedIndependentComplete,row.remainingDue,row.lateAfterPlan,esc(label(row.state))
      ]))+page.html+
      '<h3>Original proposed targets</h3>'+table(['Target','Planned','Recorded','Difference','Original review met'],r.targets.map(row=>[esc(label(row.key)),esc(fixed(row.planned)),esc(fixed(row.observed)),esc(fixed(row.delta)),esc(fixed(row.observedMet))]))+
      '<h3>Daily delivery</h3><p>Recorded attempts follow first-attempt date. Delivered-on-date counts current completed outputs on their actual UTC date.</p>'+
      table(['UTC date','Planned purchases','Recorded attempts','Completed from attempts','Delivered on date','Unmatched'],r.days.map(row=>[esc(row.date),row.plannedCompletePurchases,row.observedIntents,row.completedFromAttempts,row.completedOnDate,row.unmatchedIntents]))+
      '<h3>Accountable buyer operators</h3>'+table(['Buyer / operator','Planned independent','Recorded intents','Recorded independent','Unmatched'],r.operators.map(row=>[esc(row.labels.join('; '))+'<small>'+esc(row.operatorId||'Unassigned')+'</small>',row.plannedIndependentOpportunities,row.observedIntents,row.observedIndependentComplete,row.unmatchedIntents]));
  }
  function identity(){
    const r=state.report;if(!r)return '<p class="cd-empty">Open a comparison first.</p>';
    const kinds=[['buyer','Buyer'],['merchant','Merchant'],['operation','Useful operation'],['facilitator','Facilitator']],kind=state.linkKind||'buyer';
    const planned=r.joins.filter(row=>row.kind===kind),c=r.input.review.cohort;
    const observed=kind==='operation'?c.inputs.operations:kind==='facilitator'?c.inputs.facilitators:c.selectedDeployments.filter(row=>kind==='buyer'?['BUYER','BOTH'].includes(row.role):['MERCHANT','BOTH'].includes(row.role));
    return '<p>Original deployment and operator identities match automatically. Useful operations also retain their original scope and expected output. Use a named association when the plan used a different identity.</p>'+
      '<form data-cd-form="identity" class="cd-form"><label>Identity kind<select name="kind" data-cd-field="linkKind">'+kinds.map(([id,name])=>'<option value="'+id+'"'+(kind===id?' selected':'')+'>'+name+'</option>').join('')+'</select></label>'+
      '<label>Planned identity<select name="plannedId" required>'+choices(planned.map(row=>[row.plannedId,row.plannedLabel+' · '+row.plannedId]),'')+'</select></label>'+
      '<label>Recorded identity<select name="observedId" required>'+choices(observed.map(row=>[row.id,(row.name||row.label||row.id)+' · '+row.id]),'')+'</select></label>'+
      '<label class="cd-wide">Why these refer to the same original participant or operation<textarea name="note" required rows="2"></textarea></label><button type="submit"'+(pending()?' disabled data-cd-fixed="true"':'')+'>Save association in comparison</button></form>'+
      table(['Kind','Planned identity','Recorded identity','Basis / note',''],r.joins.map(row=>[esc(label(row.kind)),esc(row.plannedLabel)+'<small>'+esc(row.plannedId)+'</small>',esc(row.observedLabel||'Unassigned')+'<small>'+esc(row.observedId||'')+'</small>',esc(label(row.basis))+'<small>'+esc(row.note)+'</small>',row.basis==='OPERATOR_ASSOCIATION'?btn('Use original matching','remove-link','data-kind="'+esc(row.kind)+'" data-id="'+esc(row.plannedId)+'"',pending()):'']));
  }
  function placement(){
    const r=state.report;if(!r)return '<p class="cd-empty">Open a comparison first.</p>';
    const selected=state.editIntent?r.records.find(row=>row.id===state.editIntent):null,targets=new Map(r.rows.map(row=>[row.id,row]));
    const candidateTargetIds=selected?r.candidateGroups.find(row=>row.id===selected.candidateGroupId)?.targetIds||[]:[];
    let rows=r.records;if(state.search.trim()){const q=state.search.toLowerCase();rows=rows.filter(row=>[row.id,row.intentId,row.operationId,row.buyerOperatorId,...row.purchaseIds].join(' ').toLowerCase().includes(q));}
    const page=pager(rows);
    const form=selected?'<section class="cd-panel"><h3>Place original intent '+esc(selected.intentId||selected.id)+'</h3><p>'+esc(stamp(selected.firstAttemptAt))+' · '+esc(selected.operationId||'Useful operation unassigned')+'</p>'+
      (candidateTargetIds.length?'<form data-cd-form="placement" class="cd-form"><label class="cd-wide">Planned opportunity with matching identities<select name="targetId" required>'+choices(candidateTargetIds.map(id=>{const target=targets.get(id);return[id,target.date+' · '+target.label+' · '+id];}),selected.targetId)+'</select></label><label class="cd-wide">Original basis for placing this intent<textarea name="note" required rows="2">'+esc(selected.assignmentNote)+'</textarea></label><button type="submit"'+(pending()?' disabled data-cd-fixed="true"':'')+'>Save placement</button></form>':'<p>Associate the original participants and useful operation on the Identity associations tab. Candidate opportunities retain the same network, asset and selected facilitator.</p>')+
      btn('Close placement','close-placement')+'</section>':'';
    return '<p>Each original intent group is counted once, including repeated purchase observations. An unambiguous identity and UTC date match is automatic. Explicit placement can preserve a later or earlier delivery date.</p>'+form+
      '<label class="cd-search">Search original intents<input data-cd-field="search" value="'+esc(state.search)+'" placeholder="Buyer, operation, intent or purchase"></label>'+
      table(['Original intent / operator','First attempt / current output','Native result','Placement',''],page.rows.map(row=>[
        esc(row.intentId||'Unidentified intent')+'<small>'+esc(row.buyerOperatorId||'Unassigned operator')+'<br>'+esc(row.id)+'</small>',
        esc(stamp(row.firstAttemptAt))+'<small>Output: '+esc(stamp(row.currentCompletedAt))+'</small>',
        (row.independentCompleteInWindow?'Independent complete':row.completeInWindow?'Complete':row.refundedAfterSettlement?'Refunded':row.cancelledAfterSettlement?'Canceled after settlement':row.settled?'Settled; output pending':row.attempted?'Attempted':'No placed attempt')+(row.lateAfterPlan?'<small>'+esc(row.latenessSeconds)+' seconds after plan</small>':''),
        esc(row.targetId||label(row.placement))+'<small>'+esc(row.assignmentNote)+'</small>',
        btn('Place','edit-intent','data-id="'+esc(row.id)+'"',pending())+(row.placement==='OPERATOR_ASSIGNMENT'?btn('Use automatic match','remove-assignment','data-id="'+esc(row.id)+'"',pending()):'')
      ]))+page.html;
  }
  function sourceView(){
    const r=state.report,files=(caseValue.sources||[]).filter(row=>row.filename?.startsWith('sf47-cohort-delivery-'));
    return '<h3>Saved comparison editions</h3><div class="cd-tools"><label>Original case source<select data-cd-field="selectedSource">'+choices(files.map(row=>[row.id,row.filename+' · '+stamp(row.observedAt||row.createdAt)]),state.selectedSource)+'</select></label>'+btn('Open saved comparison','open-source','',!state.selectedSource||pending())+btn('Download complete case','case-export')+'</div>'+
      (r?'<h3>Original documents</h3><div class="cd-actions">'+btn('Download selected plan JSON','original-plan')+btn('Download original cohort JSON','original-review')+btn('Download original cohort archive','review-export')+btn('Download editable comparison input','input-json')+'</div>'+
      table(['Original source','Value'],[['Case',r.source.programId],['Plan revision',r.source.plan.planContentSha256],['Frozen review',r.source.reviewId],['Measurement',r.source.measurementSha256],['Recorded mode',r.source.nativeMode],['Planned window',r.source.plannedWindow.start+' through '+r.source.plannedWindow.end],['Observed window',r.source.observedWindow.start+' through '+r.source.observedWindow.end],['Observed cutoff',r.source.observedWindow.asOfAt]].map(row=>row.map(esc)))+
      '<h3>Source differences and original review findings</h3>'+table(['Finding','Identity','Description'],[...r.issues,...r.nativeIssues].map(row=>[esc(row.code),esc(row.id||''),esc(row.message)]))+
      detail('Recorded amounts by network and asset',r.amounts)+detail('Recorded recovery and support outcomes',r.outcomes)+detail('Complete parent products',r.products)+detail('Original frozen cohort review',r.input.review)+detail('Complete original adoption document',r.input.planDocument):'');
  }
  function render(){
    if(!available())return;
    const plans=(caseValue.sources||[]).filter(row=>row.filename?.startsWith('sf47-cohort-plan-tranche-'));
    const reviews=(caseValue.reviews||[]).filter(row=>row.purpose==='COHORT_EVALUATION');
    const r=state.report;
    root.innerHTML='<header class="cd-heading"><div><h2>Cohort delivery</h2><p>Compare the saved adoption plan with recorded customer delivery.</p></div><div class="cd-actions">'+btn('Refresh case','refresh')+btn('Open JSON','import')+'<input type="file" accept=".json,application/json" data-cd-import hidden></div></header>'+
      (state.error?'<p class="cd-error" role="alert">'+esc(state.error)+'</p>':'')+
      (state.notice?'<p class="cd-notice" role="status">'+esc(state.notice)+'</p>':'')+
      (state.storageNotice?'<p class="cd-notice">'+esc(state.storageNotice)+'</p>':'')+
      (pending()?'<p class="cd-notice">The original save request is retained. '+btn(state.accepted?'Reopen accepted source':'Resume same save','resume')+btn('Download retained request JSON','pending-json')+'</p>':'')+
      '<section class="cd-panel"><div class="cd-source-picker"><label>Saved adoption plan<select data-cd-field="selectedPlan">'+choices(plans.map(row=>[row.id,row.filename]),state.selectedPlan,plans.length?'Select saved plan…':'Save a plan in Customer adoption plan')+'</select></label>'+
      '<label>Original frozen cohort review<select data-cd-field="selectedReview">'+choices(reviews.map(row=>[row.id,(row.cohortName||row.id)+' · '+stamp(row.createdAt)]),state.selectedReview,reviews.length?'Select frozen review…':'Freeze a review in Cohort acceptance')+'</select></label>'+
      btn('Compare selected sources','load','',!state.selectedPlan||!state.selectedReview||pending())+'</div></section>'+
      (r?'<section class="cd-panel"><div class="cd-heading"><div><h3>'+esc(r.title)+'</h3><p>Tranche '+r.source.plannedWindow.tranche+' · '+esc(r.source.nativeMode)+' · observed through '+esc(stamp(r.source.observedWindow.asOfAt))+'</p></div><div class="cd-actions">'+btn('Save comparison edition','save')+btn('JSON','json')+btn('CSV','csv')+btn('Readable HTML','html')+'</div></div>'+
      '<form data-cd-form="details" class="cd-form"><label>Comparison title<input name="title" value="'+esc(state.input.title)+'" required maxlength="500"></label><label>Operator note<input name="note" value="'+esc(state.input.note)+'"></label><button type="submit"'+(pending()?' disabled data-cd-fixed="true"':'')+'>Update title and note</button></form></section>':'')+
      parkedComparisons()+'<nav class="cd-tabs" aria-label="Cohort delivery sections">'+[['report','Delivery report'],['identity','Identity associations'],['placement','Original intent placement'],['sources','Saved editions and sources']].map(([id,name])=>btn(name,'tab','data-tab="'+id+'"'+(state.tab===id?' aria-current="page"':''))).join('')+'</nav>'+
      '<div class="cd-content">'+({report:overview,identity,placement,sources:sourceView}[state.tab]||overview)()+'</div>';
    controls();
  }
  root.addEventListener('change',event=>{
    const field=event.target.dataset.cdField;
    if(!field)return;
    state[field]=event.target.value;
    if(['filter','search','linkKind'].includes(field)){state.page=0;render();}else controls();
    if(['selectedPlan','selectedReview','selectedSource'].includes(field))render();
    persist();
  });
  root.addEventListener('submit',event=>{
    const form=event.target.closest('form[data-cd-form]');if(!form)return;event.preventDefault();
    run(async()=>{
      requireEditable();if(!state.input)throw new Error('Open a comparison first.');
      const values=Object.fromEntries(new FormData(form)),next=copy(state.input);
      if(form.dataset.cdForm==='identity'){
        next.links=next.links.filter(row=>!(row.kind===values.kind&&row.plannedId===values.plannedId));next.links.push(values);
      }else if(form.dataset.cdForm==='placement'){
        next.assignments=next.assignments.filter(row=>row.intentId!==state.editIntent);next.assignments.push({intentId:state.editIntent,...values});
      }else{next.title=values.title;next.note=values.note;}
      recalculate(next);state.notice='Updated this comparison with its original source documents retained.';
    });
  });
  root.addEventListener('click',event=>{
    const target=event.target.closest('[data-cd-action]');if(!target||target.disabled)return;
    const action=target.dataset.cdAction;
    if(action==='import'){if(!locked())$('[data-cd-import]').click();return;}
    run(async()=>{
      if(action==='tab'){state.tab=target.dataset.tab;state.page=0;return;}
      if(action==='previous'){state.page--;return;}if(action==='next'){state.page++;return;}
      if(action==='refresh'){await refresh();state.notice='Refreshed the current case source list.';return;}
      if(action==='download-parked'||action==='resume-parked'){
        const retained=state.parkedComparisons.find(row=>row.id===target.dataset.id);
        if(!retained)throw new Error('The retained comparison is absent from this original desk.');
        if(action==='download-parked')return download(JSON.stringify(retained.input,null,2)+'\n',clean(retained.input.title)+'-original-input.json');
        openDocument(retained.input,true);state.savedSourceId=retained.savedSourceId;state.selectedPlan=retained.selectedPlan;
        state.selectedReview=retained.selectedReview;state.tab='report';state.notice='Resumed the complete retained comparison draft.';return;
      }
      if(action==='load'){
        requireEditable();
        const meta=caseValue.sources.find(row=>row.id===state.selectedPlan);
        if(!meta)throw new Error('Select an original saved adoption plan.');
        const plan=JSON.parse(await readSource(meta)),review=await saveApi(prefix+'/reviews/'+encodeURIComponent(state.selectedReview));
        const next=seedCohortDeliveryComparison(plan,review,{planSourceId:meta.id});
        if(next.review.cohort.source.programId!==caseId)throw new Error('The original cohort belongs to another case.');
        recalculate(next);state.tab='report';state.notice='Opened the original saved adoption plan and frozen cohort review.';return;
      }
      if(action==='save'||action==='resume')return save();
      if(action==='open-source'){
        const meta=caseValue.sources.find(row=>row.id===state.selectedSource);if(!meta)throw new Error('Select a saved comparison.');
        openDocument(JSON.parse(await readSource(meta)),true);state.savedSourceId=meta.id;state.tab='report';state.notice='Reopened '+meta.filename+' from the original case.';return;
      }
      if(action==='import'){$('[data-cd-import]').click();return;}
      if(action==='json')return download(JSON.stringify(state.report,null,2)+'\n',clean(state.input.title)+'.json');
      if(action==='csv')return download(exportCohortDeliveryCsv(state.report),clean(state.input.title)+'.csv','text/csv');
      if(action==='html')return download(exportCohortDeliveryHtml(state.report),clean(state.input.title)+'.html','text/html');
      if(action==='input-json')return download(JSON.stringify(state.input,null,2)+'\n','cohort-delivery-input.json');
      if(action==='original-plan')return download(JSON.stringify(state.input.planDocument,null,2)+'\n','original-adoption-plan.json');
      if(action==='original-review')return download(JSON.stringify(state.input.review,null,2)+'\n','original-cohort-review.json');
      if(action==='pending-json'){const request=state.accepted||state.pending;if(request)download(decoded(request.payload.data.contentBase64),request.payload.data.filename);return;}
      if(action==='case-export'||action==='review-export'){
        const route=action==='case-export'?prefix+'/export.zip':prefix+'/cohort-reviews/'+encodeURIComponent(state.report.source.reviewId)+'/export.zip';
        const response=await saveApi(route,undefined,{download:true});download(await response.blob(),action==='case-export'?caseId+'.zip':state.report.source.reviewId+'.zip','application/zip');return;
      }
      if(action==='edit-intent'){state.editIntent=target.dataset.id;return;}
      if(action==='close-placement'){state.editIntent=null;return;}
      if(action==='remove-link'||action==='remove-assignment'){
        requireEditable();const next=copy(state.input);
        if(action==='remove-link'){next.links=next.links.filter(row=>!(row.kind===target.dataset.kind&&row.plannedId===target.dataset.id));next.assignments=[];state.notice='Restored original identity matching. Explicit intent placements were cleared for review against the changed associations.';}
        else next.assignments=next.assignments.filter(row=>row.intentId!==target.dataset.id);
        recalculate(next);return;
      }
    });
  });
  root.addEventListener('change',event=>{
    if(!event.target.matches('[data-cd-import]'))return;
    const file=event.target.files?.[0];if(!file)return;
    run(async()=>{requireEditable();if(file.size>MAX)throw new Error('Open a complete comparison within 8 MiB.');openDocument(JSON.parse(await file.text()));state.tab='report';state.notice='Opened the complete comparison and original documents from '+file.name+'.';});
  });
  render();
  async function openSavedWorkflow(selection){
    await ready;
    if(!available())throw new Error('Open this original comparison desk before selecting a source.');
    if(state.inflight||pending())throw new Error('Finish the retained comparison request before opening another source.');
    if(selection?.kind!=='cohort-delivery'||typeof selection.sourceId!=='string')
      throw new Error('Select an original saved cohort comparison.');
    if(selection.caseId!==undefined&&selection.caseId!==caseId||selection.expectedVersion!==undefined&&selection.expectedVersion!==caseValue.program.version)
      throw new Error('Refresh this original case before opening its saved comparison.');
    const meta=caseValue.sources.find(row=>row.id===selection.sourceId&&row.mediaType==='application/json'&&row.filename?.startsWith('sf47-cohort-delivery-'));
    if(!meta)throw new Error('The selected comparison source is absent from this original case.');
    state.error='';
    const work=(async()=>{
      const document=JSON.parse(await readSource(meta));
      if(!available())throw new Error('The comparison desk changed while its original source was opening.');
      openDocument(document,true);state.savedSourceId=meta.id;state.selectedSource=meta.id;
      state.tab='report';state.notice='Reopened '+meta.filename+'; earlier comparison drafts remain available.';
      return {outcome:'opened',caseId,kind:'cohort-delivery',sourceId:meta.id};
    })();
    state.inflight=work;controls();
    try{return await work;}
    catch(problem){state.error=problem.message||String(problem);throw problem;}
    finally{if(state.inflight===work)state.inflight=null;persist();if(available())render();}
  }
  const ready=(async()=>{
    if(state.inflight)await state.inflight;
    if(state.input&&!state.report){try{state.report=compareCohortDelivery(state.input);}catch(error){state.error=error.message;}}
    if(state.accepted){try{await finishAccepted();}catch(error){state.error=error.message;}}
    if(available())render();
  })();
  return {root,ready,openSavedWorkflow,setHostBusy(value){hostBusy=!!value;controls();},updateCurrent(next){if(next?.program?.id!==caseId)throw new Error('Retain the original comparison case.');caseValue=next;if(available())render();},dispose(){persist();active=false;}};
}
