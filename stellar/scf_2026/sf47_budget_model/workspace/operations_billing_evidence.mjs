import {currentStaffContext,staffDeskStorageKey,assertStaffRequestActor} from './staff-session.mjs';
const SCHEMA='sf47.billing-evidence-desk.v1';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone=v=>structuredClone(v),enc=encodeURIComponent;
const today=()=>new Date().toISOString().slice(0,10);
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
function styles(){if(document.querySelector('link[data-billing-evidence-style]'))return;const l=document.createElement('link');l.rel='stylesheet';l.href='/operations_billing_evidence.css';l.dataset.billingEvidenceStyle='true';document.head.append(l);}
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
function readable(value,depth=0){
  if(value===null||value===undefined)return '<span>—</span>';
  if(typeof value!=='object')return '<span>'+esc(value)+'</span>';
  if(depth>7)return '<pre>'+esc(JSON.stringify(value,null,2))+'</pre>';
  if(Array.isArray(value))return value.length?'<ol>'+value.map(v=>'<li>'+readable(v,depth+1)+'</li>').join('')+'</ol>':'<p>None recorded.</p>';
  return '<dl>'+Object.entries(value).map(([key,v])=>'<dt>'+esc(key.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/_/g,' '))+'</dt><dd>'+readable(v,depth+1)+'</dd>').join('')+'</dl>';
}
export function mountBillingEvidence({container,current,api,saveApi=api,session={},mutationId,recordingActor,staffContext=currentStaffContext(),isCurrent=()=>true,onSources=()=>{}}){
  styles();
  const context=staffContext?{...staffContext}:null;
  const storageKey=staffDeskStorageKey('sf47.billing-evidence.'+current.program.id,context);
  if(!session.loaded){try{Object.assign(session,JSON.parse(sessionStorage.getItem(storageKey)||'{}'));}catch{}session.loaded=true;}
  session.inputs||={};session.items||={};session.history||=[];session.pending??=null;session.reviewId??=null;session.expectedRevision??=0;
  const root=document.createElement('section');root.className='billing-evidence';root.setAttribute('aria-label','Billing evidence');container.replaceChildren(root);
  const path='/api/operations/'+enc(current.program.id)+'/billing-evidence';
  const state={catalog:null,preview:null,previewRequest:null,saved:null,comparison:null,inspected:null,busy:false,message:'',error:false};
  let active=true,hostBusy=false;
  const visible=()=>active&&root.isConnected&&isCurrent();
  const input=(name,fallback='')=>session.inputs[name]??fallback;
  function actorValue(){try{return typeof recordingActor==='function'?recordingActor():recordingActor||context?.actor||'';}catch{return context?.actor||'';}}
  const button=(label,action,disabled=false,attrs='')=>'<button type="button" data-be-action="'+action+'"'+(disabled?' data-fixed="true" disabled':'')+' '+attrs+'>'+esc(label)+'</button>';
  function field(name,label,fallback='',type='text',help=''){
    return '<label class="be-field"><span>'+esc(label)+'</span>'+(type==='textarea'?'<textarea name="'+esc(name)+'" rows="3">'+esc(input(name,fallback))+'</textarea>':'<input name="'+esc(name)+'" type="'+type+'" value="'+esc(input(name,fallback))+'">')+(help?'<small>'+esc(help)+'</small>':'')+'</label>';
  }
  function persist(required=false){try{const raw=JSON.stringify(session);sessionStorage.setItem(storageKey,raw);if(sessionStorage.getItem(storageKey)!==raw)throw Error('Stored desk differs.');}catch(e){if(required)throw Error('Retain the complete desk before sending its save request: '+e.message);}}
  function capture(){
    root.querySelectorAll('[name]').forEach(el=>session.inputs[el.name]=el.value);
    root.querySelectorAll('[data-be-item]').forEach(el=>{
      const key=el.dataset.beItem,row=session.items[key]||={selected:false,basis:'SOURCE_DATES',reason:'',customerExplanation:'',shareDescriptions:false,shareQuantities:false};
      el.querySelectorAll('[data-item-field]').forEach(f=>row[f.dataset.itemField]=f.type==='checkbox'?f.checked:f.value);
    });
    persist();
  }
  function busy(){
    root.setAttribute('aria-busy',String(state.busy||hostBusy));
    const recovery=new Set(['resume','revise-rejected','save-desk','save-request']);
    root.querySelectorAll('button,input,textarea,select').forEach(el=>{el.disabled=state.busy||hostBusy||el.dataset.fixed==='true'||Boolean(session.pending&&!recovery.has(el.dataset.beAction));});
  }
  async function run(fn){if(!visible()||state.busy||hostBusy)return;capture();state.busy=true;state.message='';state.error=false;busy();try{await fn();}catch(e){state.message=e.message||String(e);state.error=true;}finally{state.busy=false;persist();if(visible())render();}}
  function clearPreview(){state.preview=null;state.previewRequest=null;}
  function currentAccount(){return state.catalog?.accounts?.find(a=>a.accountKey===input('accountKey'))||null;}
  async function refresh(){state.catalog=await api(path);if(state.catalog.programId!==current.program.id)throw Error('The catalog belongs to another original case.');}
  function request(){
    const account=currentAccount();if(!account)throw Error('Select the original accounting account and customer.');
    const rows=(state.catalog.items||[]).filter(item=>item.accountKey===account.accountKey&&session.items[item.key]?.selected);
    if(!rows.length)throw Error('Select at least one original billing chain.');
    const selection={title:input('title').trim(),accountKey:account.accountKey,endpointId:account.endpointId,customerId:account.customerId,
      periodStart:input('periodStart'),periodEnd:input('periodEnd'),asOf:input('asOf',today()),explanation:input('explanation'),
      items:rows.map(item=>{const v=session.items[item.key];return {key:item.key,expectedChainSha256:item.chainSha256,basis:v.basis,
        reason:v.reason||'',customerExplanation:v.customerExplanation||'',shareDescriptions:Boolean(v.shareDescriptions),shareQuantities:Boolean(v.shareQuantities)};})};
    if(!selection.title||!selection.explanation.trim()||!selection.periodStart||!selection.periodEnd||!selection.asOf)throw Error('Enter a title, customer introduction, service-period dates and the separate account as-of date.');
    if(selection.periodEnd<selection.periodStart)throw Error('The service period must end on or after its start.');
    if(selection.items.some(row=>!row.customerExplanation.trim()))throw Error('Write the customer-facing explanation for every selected chain.');
    if(selection.items.some(row=>row.basis==='REVIEWED_INCLUSION'&&!row.reason.trim()))throw Error('Explain each reviewed inclusion whose source dates do not wholly establish this service period.');
    return {expectedVersion:state.catalog.version,reviewId:session.reviewId,expectedRevision:session.expectedRevision,selection};
  }
  function validatePending(p){
    if(!p||p.endpoint!==path+'/save'||!plain(p.body)||typeof p.body.requestId!=='string'||typeof p.body.expectedPreviewSha256!=='string')throw Error('Choose this case’s complete original evidence save request.');
    assertStaffRequestActor(p.body,context);return p;
  }
  async function sendOriginal(body){
    if(body){if(session.pending)throw Error('Recover the retained original save first.');session.pending={endpoint:path+'/save',body:clone(body),preparedAt:new Date().toISOString()};}
    const original=validatePending(session.pending);persist(true);
    let result;
    try{result=await saveApi(original.endpoint,clone(original.body));}
    catch(e){
      original.error={message:e.message,code:e.code||null,status:e.status||null,at:new Date().toISOString()};
      // Only the backend's documented pre-save refusals permit a revised request.
      original.definitivelyRejected=([409,422].includes(e.status)&&new Set(['BILLING_EVIDENCE_STALE','VERSION_CONFLICT','REQUEST_CONFLICT','BILLING_EVIDENCE_INVALID']).has(e.code))||(e.status===413&&e.code==='BILLING_EVIDENCE_INVALID');
      persist();throw e;
    }
    // Keep the exact receipt before later UI refresh or local persistence can fail.
    original.receipt=clone(result);session.lastReceipt=clone(result);
    session.history.push({...clone(original),receivedAt:new Date().toISOString()});
    session.pending=null;session.reviewId=result.reviewId;session.expectedRevision=result.revision;
    persist(true);clearPreview();
    state.saved=await api(path+'/'+enc(result.reviewId)+'?revision='+enc(result.revision));
    await refresh();state.message='Saved revision '+result.revision+'. Its evidence and account documents are frozen; no accounting transaction was made.';
  }
  function saveDesk(){capture();download(new Blob([JSON.stringify({schema:SCHEMA,caseId:current.program.id,session},null,2)+'\n'],{type:'application/json'}),current.program.id+'-billing-evidence-desk.json');}
  function loadSelection(saved){
    const record=saved.record,preview=record.preview,selection=preview.selection;
    session.inputs={...session.inputs,...clone(selection)};
    delete session.inputs.items;
    session.items=Object.fromEntries(selection.items.map(item=>[item.key,{...clone(item),selected:true}]));
    session.reviewId=record.id;session.expectedRevision=record.revision;
    clearPreview();state.comparison=null;
  }
  function dates(item){return (item.sourcePeriods||[]).map(p=>esc(p.label||'Original source')+': '+esc(p.startDate)+' — '+esc(p.endDate)).join('<br>')||'No service-period dates recorded in this source.';}
  function itemCard(item){
    const v=session.items[item.key]||{};
    return '<article class="be-item" data-be-item="'+esc(item.key)+'"><label class="be-check"><input type="checkbox" data-item-field="selected"'+(v.selected?' checked':'')+'><strong>'+esc(item.title||item.key)+'</strong></label><p>'+esc(item.domain)+' · '+esc(item.currency?.code||item.currency||'')+' · original '+esc(item.chainId)+'</p><p>'+dates(item)+'</p><p>Prepared amount: '+esc(item.preparedAmount??'—')+' · Current amount: '+esc(item.currentAmount??'—')+' · '+esc(item.historyCount)+' retained history entries'+(item.pending?' · unresolved activity retained':'')+'</p><p>Native documents: '+esc((item.invoiceIds||[]).join(', ')||'None linked')+'</p><div class="be-grid"><label class="be-field"><span>Service-period basis</span><select data-item-field="basis"><option value="SOURCE_DATES"'+(v.basis!=='REVIEWED_INCLUSION'?' selected':'')+'>Original source dates wholly within period</option><option value="REVIEWED_INCLUSION"'+(v.basis==='REVIEWED_INCLUSION'?' selected':'')+'>Explicit reviewed inclusion</option></select></label><label class="be-field"><span>Internal inclusion reason</span><textarea data-item-field="reason" rows="2">'+esc(v.reason)+'</textarea></label></div><label class="be-field"><span>Customer explanation for this chain</span><textarea data-item-field="customerExplanation" rows="2">'+esc(v.customerExplanation)+'</textarea><small>Only text you select for the customer belongs here. Internal costs, authority notes and review history remain in the full case.</small></label><p>These options control the supplemental source explanation. Unchanged issued invoices and credits still show their original customer-facing lines and quantities.</p><div class="be-checks"><label class="be-check"><input type="checkbox" data-item-field="shareDescriptions"'+(v.shareDescriptions?' checked':'')+'>Share supplemental source descriptions</label><label class="be-check"><input type="checkbox" data-item-field="shareQuantities"'+(v.shareQuantities?' checked':'')+'>Share supplemental source quantities</label></div></article>';
  }
  function previewHtml(){
    const p=state.preview;if(!p)return '';
    return '<section class="be-panel"><h3>Reviewed selection</h3><dl><dt>Service period</dt><dd>'+esc(p.selection.periodStart)+' — '+esc(p.selection.periodEnd)+'</dd><dt>Account as of</dt><dd>'+esc(p.accountAsOf||p.selection.asOf)+'</dd><dt>Customer</dt><dd>'+esc(p.customer?.name||p.selection.customerId)+'</dd><dt>Native observation revision</dt><dd>'+esc(p.nativeRevision)+'</dd></dl><p>No proration or total is calculated by summing charge history. The original account documents remain authoritative for account balances.</p>'+p.items.map(item=>'<article><h4>'+esc(item.title||item.key)+'</h4><p>Source-period assessment: <strong>'+esc(item.periodStatus)+'</strong> · '+esc(item.basis)+'</p><p>'+esc(item.reason||'Original source periods establish inclusion.')+'</p><p>Customer explanation: '+esc(item.customerExplanation||'No additional customer explanation selected.')+'</p><p>Share source descriptions: '+(item.shareDescriptions?'Yes':'No')+' · Share quantities: '+(item.shareQuantities?'Yes':'No')+'</p><details><summary>Original correction chain, source and native document observations</summary>'+readable({chainId:item.chainId,sourcePeriods:item.sourcePeriods,history:item.history,sourceLines:item.sourceLines,native:item.native})+'</details></article>').join('')+'<p>Native invoice IDs outside this explanation: '+esc((p.nativeInvoiceIdsOutsideSelection||[]).join(', ')||'None reported')+'. They remain outside evidence coverage.</p><details><summary>Unselected source chains</summary>'+readable(p.unselected||[])+'</details>'+field('actor','Recording operator',actorValue())+button('Save this reviewed evidence','save')+'</section>';
  }
  function savedHtml(){
    if(!state.saved)return '';const {record,report}=state.saved,p=record.preview;
    return '<section class="be-panel"><h3>Saved evidence — revision '+esc(record.revision)+'</h3><p>'+esc(record.id)+' · '+esc(record.recordedAt)+' · '+esc(record.recordedBy)+'</p><p><strong>Service period:</strong> '+esc(p.selection.periodStart)+' — '+esc(p.selection.periodEnd)+'<br><strong>Frozen account as of:</strong> '+esc(p.selection.asOf)+'</p><div class="be-actions">'+button('Compare with current observations','compare')+button('Prepare next reviewed revision','revise')+button('Download customer evidence ZIP','customer-export')+button('Download complete internal case ZIP','internal-export')+'</div><p>Both downloads use this exact saved revision. Customer evidence includes the selected safe explanation and the unchanged complete customer account as of its cutoff, including entries outside this evidence selection. Original issued documents retain their customer-facing lines. The internal ZIP retains the full source case.</p><details open><summary>Customer-facing saved explanation</summary>'+readable(report)+'</details>'+(state.comparison?'<section class="be-comparison"><h4>Current comparison — original saved revision remains unchanged</h4><p>'+esc(state.comparison.changed?'Current observations differ. Review a new revision if appropriate.':'Current observations match this saved explanation.')+'</p>'+readable(state.comparison)+'</section>':'')+'</section>';
  }
  function render(){
    if(!visible())return;
    const c=state.catalog,account=currentAccount(),items=(c?.items||[]).filter(i=>account&&i.accountKey===account.accountKey);
    const pending=session.pending;
    root.innerHTML='<header><p class="be-eyebrow">Customer handover</p><h2>Billing evidence</h2><p>Explain original milestone, expense and hourly Work charges for a reviewed service period. Account balances and every financial document remain with the existing accounting account.</p><a href="/BILLING_EVIDENCE.md" target="_blank" rel="noopener">Operating guide</a></header>'+
      '<div class="be-actions">'+button('Refresh local source catalog','refresh')+button('New explanation','new')+button('Save working desk','save-desk')+button('Open saved working desk','open-desk')+button('Inspect downloaded evidence ZIP','inspect')+button('Open case sources','sources')+'</div>'+
      '<p role="'+(state.error?'alert':'status')+'" class="'+(state.error?'be-error':'be-status')+'">'+esc(state.message)+'</p>'+
      (pending?'<section class="be-pending"><h3>Original save needs reconciliation</h3><p>'+esc(pending.body.requestId)+' · '+esc(pending.error?.message||'The exact original request is retained.')+'</p><p>Resume this exact request. A missing response does not authorize another saved edition.</p><div class="be-actions">'+button('Resume original save','resume')+button('Download exact request','save-request')+(pending.definitivelyRejected?button('Revise refused request','revise-rejected'):'')+'</div></section>':'')+
      (c?'<section class="be-panel"><h3>'+esc(session.reviewId?'Prepare revision '+(session.expectedRevision+1):'Prepare an explanation')+'</h3><label class="be-field"><span>Original accounting account and customer</span><select name="accountKey"><option value="">Choose…</option>'+c.accounts.map(a=>'<option value="'+esc(a.accountKey)+'"'+(input('accountKey')===a.accountKey?' selected':'')+'>'+esc(a.customerName||a.customerId)+' · '+esc(a.endpointId)+' · '+esc(a.accountingIdentity.workspaceId)+'</option>').join('')+'</select></label>'+field('title','Evidence title')+'<div class="be-grid">'+field('periodStart','Service period starts','','date')+field('periodEnd','Service period ends','','date')+field('asOf','Native account as of',today(),'date','Account cutoff is separate from the service period.')+'</div>'+field('explanation','Customer introduction','','textarea','This explanation is shared in the customer report; keep internal review notes in each inclusion reason.')+'<h4>Choose original billing chains</h4><p>Review the original dates and correction history. Missing or overlapping source periods require an explicit inclusion reason; no amount is prorated.</p>'+items.map(itemCard).join('')+(!items.length?'<p>Select an account with original billing sources.</p>':'')+button('Preview selected evidence','preview',!items.length)+'</section>'+previewHtml()+'<section class="be-panel"><h3>Saved revisions</h3>'+(c.reviews.length?'<ul class="be-reviews">'+c.reviews.map(r=>'<li>'+button((r.title||r.id)+' — revision '+r.revision,'load',false,'data-review-id="'+esc(r.id)+'" data-revision="'+r.revision+'"')+'<small>'+esc(r.customerName)+' · '+esc(r.periodStart)+' — '+esc(r.periodEnd)+' · account as of '+esc(r.asOf)+'</small></li>').join('')+'</ul>':'<p>No saved explanation in this case yet.</p>')+'</section>'+savedHtml():'<p>Loading the original source catalog…</p>')+
      (state.inspected?'<section class="be-panel"><h3>Reopened ZIP — read only</h3><p>'+esc(state.inspected.audience)+' · '+esc(state.inspected.reviewId)+' · revision '+esc(state.inspected.revision)+'</p><p>'+(state.inspected.canReceive?'The full internal case can be received using the existing Operations import. Inspection makes no case or financial change.':'This customer handover contains no Operations case to import. Inspection makes no financial change.')+'</p>'+readable(state.inspected.report)+'</section>':'')+
      '<details><summary>Retained save and refusal history</summary>'+readable(session.history)+'</details>'+
      '<input type="file" hidden data-be-open accept=".json,application/json"><input type="file" hidden data-be-inspect accept=".zip,application/zip">';
    busy();
  }
  root.addEventListener('input',event=>{if(event.target.matches('[name],[data-item-field]')){capture();if(event.target.name==='actor')return;clearPreview();const panel=root.querySelector('.be-panel h3');if(panel)panel.dataset.previewInvalid='true';root.querySelector('[data-be-action="save"]')?.setAttribute('disabled','');}});
  root.addEventListener('change',event=>{
    if(event.target.name==='accountKey'){capture();clearPreview();state.saved=null;state.comparison=null;session.reviewId=null;session.expectedRevision=0;session.items={};render();}
  });
  root.addEventListener('click',event=>{
    const el=event.target.closest('[data-be-action]');if(!el)return;const action=el.dataset.beAction;
    if(action==='open-desk'){root.querySelector('[data-be-open]').click();return;}
    if(action==='inspect'){root.querySelector('[data-be-inspect]').click();return;}
    if(action==='save-desk'){saveDesk();return;}
    if(action==='save-request'){if(session.pending)download(new Blob([JSON.stringify(session.pending,null,2)+'\n'],{type:'application/json'}),'original-billing-evidence-request.json');return;}
    run(async()=>{
      if(action==='refresh'){await refresh();clearPreview();}
      else if(action==='new'){session.inputs={};session.items={};session.reviewId=null;session.expectedRevision=0;state.saved=null;state.comparison=null;clearPreview();}
      else if(action==='preview'){const body=request();state.preview=await api(path+'/preview',body);state.previewRequest=clone(body);}
      else if(action==='save'){
        if(!state.preview||!state.previewRequest)throw Error('Preview the current selection and privacy choices before saving.');
        if(JSON.stringify(request())!==JSON.stringify(state.previewRequest))throw Error('The selection changed. Preview it again.');
        const body={...clone(state.previewRequest),actor:input('actor',actorValue()),expectedPreviewSha256:state.preview.previewSha256};
        if(typeof body.actor!=='string'||!body.actor.trim())throw Error('Enter the original recording operator.');
        assertStaffRequestActor(body,context);body.requestId=await mutationId('billing-evidence:'+current.program.id+':save',body);await sendOriginal(body);
      }
      else if(action==='resume')await sendOriginal();
      else if(action==='revise-rejected'){if(!session.pending?.definitivelyRejected)throw Error('The outcome is uncertain; resume the original save.');session.history.push({...clone(session.pending),closedAs:'DEFINITIVELY_REJECTED',closedAt:new Date().toISOString()});session.pending=null;clearPreview();await refresh();state.message='The original refusal is retained. Correct the selection and preview a new request.';}
      else if(action==='load'){state.saved=await api(path+'/'+enc(el.dataset.reviewId)+'?revision='+enc(el.dataset.revision));loadSelection(state.saved);state.message='Opened the exact saved revision. Downloads remain frozen to it; edits need a new preview.';}
      else if(action==='revise'){loadSelection(state.saved);await refresh();const heads=state.catalog.reviews.filter(r=>r.id===session.reviewId);if(!heads.length)throw Error('The original saved review is absent from the current catalog.');const prior=state.saved.record.revision;session.expectedRevision=Math.max(...heads.map(r=>r.revision));state.message='Review the selection from saved revision '+prior+' against current head '+session.expectedRevision+'. The next saved revision will be '+(session.expectedRevision+1)+'. Downloads below remain the original selected revision.';}
      else if(action==='compare'){const r=state.saved.record;state.comparison=await api(path+'/'+enc(r.id)+'/compare',{revision:r.revision});}
      else if(action==='internal-export'||action==='customer-export'){const r=state.saved.record,audience=action==='customer-export'?'customer':'internal';const response=await api(path+'/'+enc(r.id)+'/export.zip?revision='+enc(r.revision)+'&audience='+audience,undefined,{download:true});download(await response.blob(),r.id+'-r'+r.revision+'-'+audience+'.zip');}
      else if(action==='sources')await onSources();
    });
  });
  root.addEventListener('change',event=>{
    const file=event.target.files?.[0];if(!file)return;
    if(event.target.matches('[data-be-open]'))run(async()=>{
      if(session.pending)throw Error('Reconcile the retained original save before opening another desk.');
      if(file.size>8*1024*1024)throw Error('Choose a complete working desk within 8 MiB.');
      const saved=JSON.parse(await file.text());
      if(saved.schema!==SCHEMA||saved.caseId!==current.program.id||!plain(saved.session?.inputs)||!plain(saved.session?.items)||!Array.isArray(saved.session?.history))throw Error('Choose the complete desk for this original case.');
      if(saved.session.pending)validatePending(saved.session.pending);
      saveDesk();for(const k of Object.keys(session))delete session[k];Object.assign(session,clone(saved.session),{loaded:true});persist(true);clearPreview();state.saved=null;state.comparison=null;await refresh();state.message='Reopened the complete working desk with its original request history.';
    });
    else if(event.target.matches('[data-be-inspect]'))run(async()=>{
      if(file.size>64*1024*1024||4*Math.ceil(file.size/3)+20>32*1024*1024)throw Error('Browser inspection requires the complete encoded ZIP request to fit the original 32 MiB JSON limit (a ZIP under 24 MiB). Use the original CLI for larger evidence bundles, up to 64 MiB.');
      const bytes=new Uint8Array(await file.arrayBuffer());let raw='';for(let i=0;i<bytes.length;i+=32768)raw+=String.fromCharCode(...bytes.subarray(i,i+32768));
      state.inspected=await api(path+'/inspect',{contentBase64:btoa(raw)});state.message='Opened the complete downloaded evidence ZIP read-only.';
    });
  });
  render();const ready=refresh().then(()=>{if(visible())render();});
  return {ready,dispose(){capture();active=false;root.remove();},setHostBusy(value){hostBusy=Boolean(value);if(visible())busy();}};
}
