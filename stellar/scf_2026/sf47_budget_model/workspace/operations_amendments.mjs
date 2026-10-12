// MIT. Reviewed plan amendments in the original SF47 Delivery view.
const DB_NAME='sf47-plan-amendment-drafts-v1', STORE='drafts';
const SCHEMA='stellar-forge.sf47-plan-amendment-draft.v1';
const LIMIT=512*1024;
let database;
const clone=value=>structuredClone(value);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const order=value=>Array.isArray(value)?value.map(order):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,order(value[k])])):value;
const canonical=value=>JSON.stringify(order(value));
const pretty=value=>JSON.stringify(value,null,2);
const date=()=>new Date().toISOString().slice(0,10);
const money=value=>value===null||value===undefined?'Unknown':'$'+value;
function openDatabase(){
  if(!database)database=new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,1);
    request.onupgradeneeded=()=>request.result.createObjectStore(STORE,{keyPath:'id'});
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(new Error('The browser could not open its retained amendment drafts.'));
    request.onblocked=()=>reject(new Error('Close the older amendment-draft reader before opening this edition.'));
  });
  return database;
}
async function readDraft(id){
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{const tx=db.transaction(STORE),r=tx.objectStore(STORE).get(id);
    r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);});
}
async function listDrafts(caseId,planId){
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{const tx=db.transaction(STORE),r=tx.objectStore(STORE).getAll();
    r.onsuccess=()=>resolve(r.result.filter(v=>v.caseId===caseId&&v.planId===planId).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)));
    r.onerror=()=>reject(r.error);});
}
async function writeDraft(value,expected){
  if(new TextEncoder().encode(JSON.stringify(value)).length>LIMIT)throw new Error('Download this draft and reduce its notes before continuing; the retained browser-draft bound is 512 KiB.');
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE),r=store.get(value.id);
    let failure=null;
    r.onsuccess=()=>{
      const prior=r.result;
      if((prior?.sequence??0)!==expected||(prior&&(prior.caseId!==value.caseId||prior.planId!==value.planId))){
        failure=new Error('Another tab changed this local draft. Keep your current text and reopen its retained browser edition.');failure.code='LOCAL_DRAFT_CONFLICT';tx.abort();return;
      }
      store.put(value);
    };
    tx.oncomplete=()=>resolve(value);
    tx.onabort=tx.onerror=()=>reject(failure||tx.error||new Error('The browser did not retain this draft. Download it before leaving.'));
  });
}
function download(value,name,type='application/json'){
  const blob=value instanceof Blob?value:new Blob([typeof value==='string'?value:pretty(value)],{type});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),10000);
}
const table=(headers,rows)=>'<div class="amend-scroll" tabindex="0"><table><thead><tr>'+headers.map(h=>'<th scope="col">'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(v=>'<td>'+v+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
const button=(label,action,extra='',disabled=false)=>'<button type="button" data-amend-action="'+action+'" '+extra+(disabled?' disabled data-amend-fixed="true"':'')+'>'+esc(label)+'</button>';
const input=(label,name,value,options={})=>{
  const attrs=' name="'+esc(name)+'"'+(options.required?' required':'')+(options.multiple?' multiple size="4"':'');
  let element;
  if(options.options)element='<select'+attrs+'>'+options.options.map(([key,title])=>'<option value="'+esc(key)+'"'+((options.multiple?(value||[]).includes(key):String(value??'')===String(key))?' selected':'')+'>'+esc(title)+'</option>').join('')+'</select>';
  else if(options.area)element='<textarea'+attrs+' rows="3" maxlength="12000">'+esc(value)+'</textarea>';
  else element='<input'+attrs+' type="'+(options.type||'text')+'" value="'+esc(value)+'" maxlength="12000">';
  return '<label'+(options.wide?' class="amend-wide"':'')+'>'+esc(label)+element+(options.help?'<small>'+esc(options.help)+'</small>':'')+'</label>';
};
function exposureTable(rows){
  return table(['Package / tranche','Planned USD','Recorded invoices','Invoices over plan','Remaining before invoices','Recorded payments','Payments over plan','Remaining before payments','Planned hours','Recorded hours','Hours over plan','Remaining hours'],rows.map(r=>[
    esc(r.costId)+' / '+r.tranche,esc(money(r.plannedUsd)),esc(money(r.recordedInvoiceUsd)),esc(money(r.recordedInvoicesOverPlanUsd)),
    esc(money(r.remainingBeforeRecordedInvoicesUsd)),esc(money(r.recordedPaidUsd)),esc(money(r.recordedPaymentsOverPlanUsd)),
    esc(money(r.remainingBeforeRecordedPaymentsUsd)),esc(r.plannedHours??'Unknown'),esc(r.recordedHours),
    esc(r.recordedHoursOverPlan??'Unknown'),esc(r.remainingBeforeRecordedHours??'Unknown')]));
}
function previewHtml(p){
  if(!p)return '<p>Preview the selected saved revision to read its complete changes and original record exposure.</p>';
  const conflicts=p.compatibility.blockers;
  return '<section class="amend-comparison"><h4>Reviewed plan comparison</h4><p>Baseline revision '+p.source.plan.revision+' → selected revision '+p.selectedPlan.revision+' · original case version '+p.observedVersion+'</p>'
    +'<p><strong>'+(conflicts.length?'Resolve '+conflicts.length+' retained-record conflict'+(conflicts.length===1?'':'s'):'The selected plan preserves the referenced records and original receipt clocks')+'</strong></p>'
    +(conflicts.length?table(['Conflict','Original target','Explanation','Retained references'],conflicts.map(v=>[esc(v.code),esc(v.id??v.tranche??''),esc(v.message),'<pre>'+esc(pretty(v.references??{before:v.before,after:v.after}))+'</pre>'])):'')
    +'<p>Case calendar anchor: '+esc(p.compatibility.caseCalendarStart??'Undated')+'. Selected planner anchor: '+esc(p.compatibility.selectedPlanningCalendarStart??'Undated')+'. The existing case retains its own anchor.</p>'
    +'<details open><summary>All '+p.changes.length+' selected input changes</summary>'+table(['Original input','Before','Selected revision'],p.changes.map(v=>[esc(v.path),v.beforePresent?'<pre>'+esc(pretty(v.before))+'</pre>':'Absent',v.afterPresent?'<pre>'+esc(pretty(v.after))+'</pre>':'Absent']))+'</details>'
    +'<h4>Recorded work and financial exposure</h4><p>These amounts compare the selected budget with recorded invoices, allocated payments and logged work. Remaining amounts do not establish unrecorded commitments or spendable cash. Paid-against-plan and invoiced-against-plan are separate comparisons.</p>'
    +'<details><summary>Original baseline</summary>'+exposureTable(p.exposure.before)+'</details>'
    +'<details open><summary>Selected baseline</summary>'+exposureTable(p.exposure.selected)+'</details>'
    +'<details><summary>Original payment-derived clocks</summary><pre>'+esc(pretty(p.paymentClocks))+'</pre></details>'
    +'<details><summary>Complete native reports and source pins</summary><pre>'+esc(pretty({source:p.source,reports:p.reports,previewSha256:p.previewSha256}))+'</pre></details></section>';
}
export function mountAmendments({container,current,api,saveApi=api,session={},mutationId,recordingActor,onCase,onSources}){
  if(!document.querySelector('link[data-sf47-amendments]')){
    const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('./operations_amendments.css',import.meta.url).href;link.dataset.sf47Amendments='';document.head.append(link);
  }
  const root=document.createElement('section');root.className='plan-amendments';root.setAttribute('aria-label','Plan amendments');container.replaceChildren(root);
  const caseId=current.program.id,planId=current.program.planId,base='/api/operations/'+caseId,sessionKey='sf47.amendments.'+caseId;
  let active=true,hostBusy=false,busy=false,caseNow=current,index=null,desk=null,drafts=[],detail=null,preview=null,error='',storageFault=false,serial=Promise.resolve(),opening=0;
  const available=()=>active&&root.isConnected;
  const $=selector=>root.querySelector(selector);
  function showError(value){error=value?.message||String(value);if(available()){const node=$('[data-amend-error]');if(node)node.textContent=error;}}
  function validDesk(value){
    if(!value||value.schema!==SCHEMA||value.caseId!==caseId||value.planId!==planId||!value.id||!value.draft?.token||!Number.isInteger(value.sequence))throw new Error('This local amendment draft belongs to another case or format.');
    if(value.pending&&(value.pending.caseId!==caseId||value.pending.planId!==planId))throw new Error('The retained request belongs to another original case.');
    return value;
  }
  function retain(change){
    const target=desk?.id;
    const work=serial.then(async()=>{
      if(!desk||desk.id!==target)throw new Error('The selected local draft changed before it could be retained.');
      const old=desk,next=clone(desk);change(next);next.sequence=old.sequence+1;next.updatedAt=new Date().toISOString();
      try{await writeDraft(next,old.sequence);desk=next;session.deskId=next.id;storageFault=false;return next;}
      catch(exc){storageFault=true;desk={...next,sequence:old.sequence};showError(exc);throw exc;}
    });
    serial=work;
    work.catch(()=>{});
    return work;
  }
  function remember(id){session.deskId=id;try{sessionStorage.setItem(sessionKey,id);}catch{}}
  function blank(inputs){
    return {schema:SCHEMA,id:'amend-draft-'+crypto.randomUUID(),caseId,planId,sequence:1,
      createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),
      draft:{token:crypto.randomUUID(),amendmentId:null,amendmentRevision:0,amendmentSha256:null,
        inputs:inputs||{selectedRevision:null,expectedContentSha256:'',asOfDate:date(),reason:'',
          basis:{kind:caseNow.program.mode==='WALKTHROUGH'?'WALKTHROUGH':'INTERNAL_PLAN',reference:'',date:null,sourceIds:[],note:''}}},
      selection:null,review:{decision:'APPROVE',statement:'',sourceIds:[],note:''},applyNote:'',
      pending:null,receipts:[]};
  }
  async function createDraft(source=null){
    await serial;if(desk?.pending)throw new Error('Recover the original pending request before opening another draft.');
    let next=blank(source?clone(source.preview.inputs):null);
    if(source){next.draft.amendmentId=source.id;next.draft.amendmentRevision=source.revision;next.draft.amendmentSha256=source.sha256;next.selection={id:source.id,revision:source.revision};}
    await writeDraft(next,0);desk=next;remember(next.id);preview=null;detail=source?{amendment:source,current:null,history:[]}:null;drafts=await listDrafts(caseId,planId);render();
    if(next.selection)await openSaved(next.selection.id,next.selection.revision,false);
  }
  async function openDraft(id){
    await serial;if(desk?.pending&&desk.id!==id)throw new Error('Recover the retained request in this draft before changing local work.');
    desk=validDesk(await readDraft(id));remember(id);preview=null;detail=null;storageFault=false;serial=Promise.resolve();render();
    if(desk.selection)await openSaved(desk.selection.id,desk.selection.revision,false);
  }
  async function refresh(){
    const [next,listing]=await Promise.all([saveApi(base),saveApi(base+'/amendments')]);
    if(next.program.id!==caseId||next.program.planId!==planId||listing.program.id!==caseId||listing.program.version!==next.program.version)throw new Error('The case changed during this read. Refresh the original case again before choosing an amendment.');
    caseNow=next;index=listing;drafts=await listDrafts(caseId,planId);
    return next;
  }
  async function openSaved(id,revision,rememberSelection=true){
    const chosen=++opening;
    if(rememberSelection)await retain(value=>{value.selection={id,revision};});
    const received=await saveApi(base+'/amendments/'+encodeURIComponent(id)+(revision?'?revision='+revision:''));
    if(!available()||chosen!==opening||desk.selection?.id!==id||(revision&&desk.selection?.revision!==revision))return;
    detail=received;render();
  }
  function fieldValue(target){return target.multiple?[...target.selectedOptions].map(o=>o.value):target.value;}
  function inputChange(target){
    const name=target.name,value=fieldValue(target);
    if(!desk||!name)return;
    preview=null;
    const changed=retain(next=>{
      if(name==='selectedRevision'){
        const row=index?.revisions.find(v=>String(v.revision)===String(value));
        next.draft.inputs.selectedRevision=row?.revision??null;next.draft.inputs.expectedContentSha256=row?.sha256??'';
      }else if(name==='reason'||name==='asOfDate')next.draft.inputs[name]=value;
      else if(name.startsWith('basis.'))next.draft.inputs.basis[name.slice(6)]=value===''&&name==='basis.date'?null:value;
      else if(name.startsWith('review.'))next.review[name.slice(7)]=value;
      else if(name==='applyNote')next.applyNote=value;
    });
    changed.then(()=>{if(available()){const b=$('[data-amend-action="save"]');if(b)b.disabled=true;}}).catch(showError);
  }
  function controls(){
    if(!available())return;
    root.setAttribute('aria-busy',String(busy||hostBusy));
    root.querySelectorAll('button').forEach(b=>{b.disabled=Boolean(b.dataset.amendFixed)||busy||hostBusy;});
    root.querySelectorAll('input,select,textarea').forEach(el=>{el.disabled=hostBusy||!desk||storageFault;});
    // Text entered after dispatch remains a later local draft. It never changes
    // the retained request which is already on the original native transaction.
    if(desk?.pending)root.querySelectorAll('[data-amend-mutation]').forEach(b=>b.disabled=true);
  }
  function render(){
    if(!available())return;
    const row=detail?.amendment,latest=detail?.current;
    const sameEdition=!!row&&(!latest||latest.revision===row.revision);
    const canReview=!!row&&sameEdition&&row.state!=='APPLIED'&&latest?.current?.businessMatches===true&&caseNow.program.state==='OPEN';
    const canApply=canReview&&row.state==='REVIEWED';
    const d=desk?.draft,items=index?.revisions||[],sourceOptions=(index?.sources||current.sources).map(s=>[s.id,s.filename+' · '+s.sha256.slice(0,12)]);
    const pending=desk?.pending;
    root.innerHTML='<header><div><h3>Plan amendments</h3><p>Select an actual saved native planning revision for this existing Delivery case. Keep the original package identities, sources and recorded work while reviewing a changed budget or schedule.</p></div><div class="amend-actions">'+button('Refresh case and plans','refresh')+button('Sources','sources')+button('Export complete case','export-case')+'</div></header>'
      +'<p>Case <code>'+esc(caseId)+'</code> · version '+caseNow.program.version+' · current baseline revision '+caseNow.program.planRevision+' · '+esc(caseNow.program.mode)+'</p>'
      +'<p role="alert" data-amend-error>'+esc(error)+'</p>'
      +(storageFault?'<p class="amend-warning">Browser retention stopped. Download the displayed draft before reopening its latest saved browser edition.</p>':'')
      +(pending?'<section class="amend-warning"><h4>Original request retained</h4><p>'+esc(pending.body.action)+' · <code>'+esc(pending.body.requestId)+'</code> · original case version '+pending.body.expectedVersion+'</p><p>'+esc(pending.error?.message||'Recover this request through the original transaction before recording another mutation.')+'</p><div class="amend-actions">'+button('Retry exact request','retry')+button('Download retained request','request-export')+(pending.error?.rejected?button('Keep draft and resolve rejected request','resolve-rejected'):'')+'</div></section>':'')
      +'<section><h4>Local work</h4><div class="amend-actions">'+input('Retained browser draft','localDraft',desk?.id||'',{options:[['','Select a retained draft'],...drafts.map(v=>[v.id,(v.draft.inputs.reason||'New amendment').slice(0,90)+' · '+v.updatedAt+(v.pending?' · request pending':'')])]})+button('New amendment draft','new')+(desk?button('Download local draft','draft-export'):'')+(storageFault?button('Reopen retained browser edition','reload-local'):'')+'</div>'
      +(d?'<form data-amend-form><div class="amend-fields">'+input('Saved native planning revision','selectedRevision',d.inputs.selectedRevision??'',{required:true,options:[['','Select an exact saved revision'],...items.filter(v=>v.revision!==caseNow.program.planRevision).map(v=>[v.revision,'Revision '+v.revision+' · '+v.savedAt+' · '+(v.note||'')])],help:'Save a partial change in the original planner, then select that complete revision here.'})
      +input('Comparison date','asOfDate',d.inputs.asOfDate,{type:'date',required:true})
      +input('Reason and intended change','reason',d.inputs.reason,{area:true,required:true,wide:true})
      +input('Decision basis','basis.kind',d.inputs.basis.kind,{options:[['INTERNAL_PLAN','Internal planning choice'],['ISSUER_DECISION','Original issuer decision'],['CUSTOMER_DECISION','Original customer decision'],...(caseNow.program.mode==='WALKTHROUGH'?[['WALKTHROUGH','Labelled walkthrough']]:[])]})
      +input('Original decision date','basis.date',d.inputs.basis.date,{type:'date'})
      +input('Original decision reference','basis.reference',d.inputs.basis.reference,{wide:true})
      +input('Retained decision attachments','basis.sourceIds',d.inputs.basis.sourceIds,{multiple:true,options:sourceOptions,wide:true})
      +input('Source and decision note','basis.note',d.inputs.basis.note,{area:true,wide:true})
      +'</div><p>'+esc(d.amendmentId?'Editing original amendment '+d.amendmentId+' from edition '+d.amendmentRevision+'.':'This draft will create one new amendment identity.')+'</p><div class="amend-actions">'+button('Preview complete amendment','preview')+button('Save proposal','save','data-amend-mutation',!preview||caseNow.program.state!=='OPEN')+'</div></form>':'<p>Open a retained local draft or start a new one.</p>')
      +previewHtml(preview)+'</section>'
      +'<section><h4>Saved proposals and applied baselines</h4>'+((index?.amendments||[]).length?table(['Original amendment','State / edition','Baseline change','Reason','Open'],index.amendments.map(a=>[
        '<code>'+esc(a.id)+'</code>',esc(a.state)+' / '+a.revision,a.fromPlan.revision+' → '+a.selectedPlan.revision,esc(a.reason),
        button('Open exact edition','open','data-id="'+a.id+'" data-revision="'+a.revision+'"')])):'<p>No amendment has been recorded in this case.</p>')+'</section>'
      +(row?'<section class="amend-saved"><h4>Saved amendment '+esc(row.id)+' · edition '+row.revision+'</h4><p>'+esc(row.state)+' · saved by '+esc(row.actor)+' at '+esc(row.updatedAt)+'</p><p>Selected source: <code>'+esc(row.preview.selectedPlan.contentSha256)+'</code></p>'
        +(!sameEdition?'<p class="amend-warning">A newer amendment edition exists. This complete historical edition remains available for inspection.</p>':'')
        +(latest&&!latest.current?.businessMatches&&row.state!=='APPLIED'?'<p class="amend-warning">The case baseline or its recorded facts changed since this proposal. Revise the proposal and preview it against the current case before deciding.</p>':'')
        +'<div class="amend-actions">'+button('Download complete saved amendment','saved-export')+button('Revise proposal in a new local draft','revise','',row.state==='APPLIED'||!sameEdition)+((detail.history||[]).length?input('Original amendment edition','savedEdition',row.revision,{options:detail.history.map(h=>[h.revision,h.revision+' · '+h.state+' · case version '+h.version])}):'')+'</div>'
        +previewHtml(row.preview)
        +(row.review?'<h4>Retained operator review</h4><pre>'+esc(pretty(row.review))+'</pre>':'')
        +(row.application?'<h4>Applied baseline receipt</h4><pre>'+esc(pretty(row.application))+'</pre>':'')
        +(canReview&&desk?'<form data-amend-review><h4>Record your review of this exact edition</h4><p>The authenticated recording operator records this decision. Issuer or customer authority remains the selected original source.</p><div class="amend-fields">'
          +input('Decision','review.decision',desk.review.decision,{options:[['APPROVE','Approve this planning amendment'],['RETURN_FOR_CHANGES','Return for changes']]})
          +input('Review statement','review.statement',desk.review.statement,{area:true,required:true,wide:true})
          +input('Review attachments','review.sourceIds',desk.review.sourceIds,{multiple:true,options:sourceOptions,wide:true})
          +input('Reason recorded in case history','review.note',desk.review.note,{area:true,required:true,wide:true})
          +'</div>'+button('Record exact review','review','data-amend-mutation')+'</form>':'')
        +(canApply&&desk?'<form data-amend-apply><h4>Apply this reviewed baseline</h4><p>This changes the selected planning baseline in the same case. The listed work, invoices, cash, original payment clocks and earlier saved reports retain their identities and history.</p>'
          +input('Application note','applyNote',desk.applyNote,{area:true,required:true,wide:true})
          +'<label class="amend-check"><input type="checkbox" name="acknowledgeBaselineChange"> I have reviewed this exact saved amendment and select it for this case.</label>'
          +button('Apply reviewed baseline','apply','data-amend-mutation')+'</form>':'')
        +'</section>':'');
    controls();
  }
  async function run(action){
    if(!available()||busy||hostBusy)return;
    busy=true;error='';controls();
    try{await action();}
    catch(exc){showError(exc);}
    finally{busy=false;if(available()){const node=$('[data-amend-error]');if(node)node.textContent=error;controls();}}
  }
  async function previewDraft(){
    await serial;
    const token=desk.draft.token,inputs=clone(desk.draft.inputs);
    await refresh();
    const result=await api(base+'/amendment-preview',{expectedVersion:caseNow.program.version,inputs});
    await serial;
    if(desk.draft.token!==token||canonical(desk.draft.inputs)!==canonical(inputs)){preview=null;error='Later draft inputs were retained. Preview those inputs before saving.';render();return;}
    await retain(next=>{next.draft.inputs=clone(result.inputs);});
    preview=result;render();
  }
  async function issue(action,data,note){
    await serial;if(storageFault)throw new Error('Retain or recover the local draft before recording this action.');
    if(desk.pending)throw new Error('Recover the original retained request first.');
    const body={expectedVersion:caseNow.program.version,actor:recordingActor(),note,action,data:clone(data)};
    body.requestId=await mutationId('operations:'+caseId,body);
    await retain(next=>{next.pending={caseId,planId,body:clone(body),draftToken:next.draft.token,startedAt:new Date().toISOString(),error:null};});
    render();await sendPending();
  }
  async function sendPending(){
    await serial;const pending=clone(desk.pending);
    if(!pending)throw new Error('No original request is pending.');
    if(pending.caseId!==caseId||pending.planId!==planId)throw new Error('The retained request belongs to another case.');
    let result;
    try{result=await saveApi(base+'/command',pending.body);}
    catch(exc){
      const rejected=[409,413,422].includes(exc.status)&&exc.code&&exc.code!=='REQUEST_CONFLICT';
      await retain(next=>{if(next.pending?.body.requestId===pending.body.requestId)next.pending.error={message:exc.message,code:exc.code||null,status:exc.status||null,rejected:Boolean(rejected)};});
      if(available())render();throw exc;
    }
    if(result.id!==caseId||result.action!==pending.body.action||result.kind!=='amendment'||!result.recordId||!result.amendmentRevision)throw new Error('The original response did not identify this amendment; keep the retained request for recovery.');
    await retain(next=>{
      if(next.pending?.body.requestId!==pending.body.requestId)throw new Error('The original local request changed during its response.');
      next.receipts.push({requestId:pending.body.requestId,request:pending.body,result:clone(result),receivedAt:new Date().toISOString()});
      next.receipts=next.receipts.slice(-12);
      // Bind a creation/save result on both the ordinary path and exact replay.
      // Later text stays in place; another draft token never inherits this ID.
      if(pending.body.action==='amendment.save'&&next.draft.token===pending.draftToken){
        next.draft.amendmentId=result.recordId;next.draft.amendmentRevision=result.amendmentRevision;next.draft.amendmentSha256=result.amendmentSha256;
      }
      next.selection={id:result.recordId,revision:result.amendmentRevision};next.pending=null;
    });
    preview=null;
    const next=await refresh();
    if(available()){await openSaved(result.recordId,result.amendmentRevision,false);if(available())await onCase?.(next,result);}
  }
  root.addEventListener('input',event=>{
    const target=event.target;
    if(target.name&&target.name!=='localDraft'&&target.name!=='savedEdition'&&target.name!=='acknowledgeBaselineChange')inputChange(target);
  });
  root.addEventListener('change',event=>{
    const target=event.target;
    if(target.name==='localDraft'&&target.value)run(()=>openDraft(target.value));
    if(target.name==='savedEdition')run(()=>openSaved(detail.amendment.id,Number(target.value)));
  });
  root.addEventListener('submit',event=>event.preventDefault());
  root.addEventListener('click',event=>{
    const target=event.target.closest('[data-amend-action]');if(!target||!root.contains(target))return;
    const action=target.dataset.amendAction;
    run(async()=>{
      if(action==='draft-export'){
        await serial.catch(()=>{});
        const retained=clone(desk);for(const el of root.querySelectorAll('[data-amend-form] [name]')){
          const value=fieldValue(el),name=el.name;
          if(name==='selectedRevision'){const row=index?.revisions.find(v=>String(v.revision)===String(value));retained.draft.inputs.selectedRevision=row?.revision??null;retained.draft.inputs.expectedContentSha256=row?.sha256??'';}
          else if(name.startsWith('basis.'))retained.draft.inputs.basis[name.slice(6)]=value;
          else retained.draft.inputs[name]=value;
        }
        download(retained,retained.id+'.json');return;
      }
      if(action==='reload-local'){
        const id=desk.id;serial=Promise.resolve();storageFault=false;await openDraft(id);return;
      }
      await serial;
      if(action==='refresh'){await refresh();if(desk?.selection)await openSaved(desk.selection.id,desk.selection.revision,false);render();return;}
      if(action==='sources'){onSources?.();return;}
      if(action==='export-case'){const response=await saveApi(base+'/export.zip',undefined,{download:true});download(await response.blob(),caseId+'-complete.zip','application/zip');return;}
      if(action==='new'){await createDraft();return;}
      if(action==='open'){if(!desk)await createDraft();await openSaved(target.dataset.id,Number(target.dataset.revision));return;}
      if(action==='revise'){await createDraft(detail.amendment);return;}
      if(action==='preview'){if(!$('[data-amend-form]').reportValidity())return;await previewDraft();return;}
      if(action==='save'){
        if(!preview||canonical(preview.inputs)!==canonical(desk.draft.inputs))throw new Error('Preview the complete current inputs before saving.');
        await issue('amendment.save',{amendmentId:desk.draft.amendmentId,expectedRevision:desk.draft.amendmentRevision,inputs:clone(desk.draft.inputs),expectedPreviewSha256:preview.previewSha256},desk.draft.inputs.reason);return;
      }
      if(action==='review'){
        if(!$('[data-amend-review]').reportValidity())return;const row=detail.amendment;
        await issue('amendment.review',{amendmentId:row.id,expectedRevision:row.revision,expectedAmendmentSha256:row.sha256,
          expectedPreviewSha256:row.preview.previewSha256,decision:desk.review.decision,statement:desk.review.statement,sourceIds:desk.review.sourceIds},desk.review.note);return;
      }
      if(action==='apply'){
        if(!$('[data-amend-apply]').reportValidity())return;
        if(!$('[name=acknowledgeBaselineChange]').checked)throw new Error('Explicitly select applying this reviewed baseline.');
        const row=detail.amendment;await issue('amendment.apply',{amendmentId:row.id,expectedRevision:row.revision,expectedAmendmentSha256:row.sha256,acknowledgeBaselineChange:true},desk.applyNote);return;
      }
      if(action==='retry'){await sendPending();return;}
      if(action==='request-export'){download(desk.pending,'Original_Amendment_Request.json');return;}
      if(action==='resolve-rejected'){
        if(!desk.pending?.error?.rejected)throw new Error('The original request has not returned a confirmed native rejection.');
        await retain(next=>{next.receipts.push({rejected:clone(next.pending),resolvedAt:new Date().toISOString()});next.receipts=next.receipts.slice(-12);next.pending=null;});
        preview=null;await refresh();render();return;
      }
      if(action==='saved-export'){download(detail.amendment,detail.amendment.id+'-edition-'+detail.amendment.revision+'.json');return;}
    });
  });
  const ready=(async()=>{
    await refresh();
    let retained=session.deskId;try{retained=retained||sessionStorage.getItem(sessionKey);}catch{}
    if(retained&&drafts.some(v=>v.id===retained))await openDraft(retained);
    else if(drafts.length===0)await createDraft();
    else render();
  })();
  ready.catch(showError);
  return {ready,dispose(){active=false;opening++;},setHostBusy(value){hostBusy=Boolean(value);controls();}};
}
