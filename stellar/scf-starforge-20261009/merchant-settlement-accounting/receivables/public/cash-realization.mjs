// MIT. Original saved cash-plan realization in the existing operator and pending request flow.
import {cashDate,cashCurrency} from './cash-planning-display.mjs';
const e=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const button=(label,action,id='',more='')=>'<button type="button" data-action="cash-realization-'+e(action)+'" data-id="'+e(id)+'" '+more+'>'+e(label)+'</button>';
const table=(headers,rows)=>'<div class="table-wrap"><table><thead><tr>'+headers.map(x=>'<th>'+e(x)+'</th>').join('')+'</tr></thead><tbody>'+
  rows.map(cells=>'<tr>'+cells.map(x=>'<td>'+e(x)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
const fileNames=['realization.html','realization.json','invoices.csv','dates.csv','events.csv','receipts.csv','manifest.json'];
export function createCashRealizationUi(host){
  const {api,openDialog,mutate,saveBlob}=host;
  const methods=new Set(['saveCashRealization']);
  let list={realizations:[]},draft=host.readSession('cashRealizationDraft'),preview=null,error='',generation=0,dialogGeneration=0;
  const workspace=()=>host.getState()?.workspaceId;
  const persist=()=>host.saveSession('cashRealizationDraft',draft);
  function body(r){
    return '<p class="small-text muted">Cash is dated by its original received date and attributed using the allocations at this review date. Allocation releases, credits and invoice voids are separate from incoming cash.</p>'+
      '<h3>Receipt performance</h3>'+table(['Currency','Expected to date','New cash allocated to planned invoices','Cash less expected','Earlier cash allocation change','Current due'],
        r.currencies.map(x=>[cashCurrency(x.currency),x.expectedToDate,x.incomingAllocatedCash,x.cashVariance,x.olderCashAllocationChange,x.currentAmountDue]))+
      '<h3>Original balance bridge</h3><p class="small-text muted">Saved opening + opening correction − allocation change − credits + lifecycle change = current signed balance.</p>'+
      table(['Invoice / customer','Currency','Saved opening','Opening correction','Allocation change','Credits','Lifecycle','Current balance'],
        r.invoices.map(x=>[x.invoiceNumber+' / '+x.customerName,cashCurrency(x.currency),x.plannedOpening,x.openingCorrection,x.allocationChange,x.creditChange,x.lifecycleChange,x.currentBalance]))+
      '<h3>Receipt dates</h3>'+table(['Date','Currency','Expected','Attributed incoming cash','Cumulative expected','Cumulative cash','Cumulative variance'],
        r.dates.map(x=>[cashDate(x.date),cashCurrency(x.currency),x.expected,x.incomingAllocatedCash,x.cumulativeExpected,x.cumulativeIncomingAllocatedCash,x.cumulativeVariance]))+
      '<h3>Full customer receipt inventory</h3>'+table(['Reference','Cash date','Accounting date','Currency','Amount','Classification','Planned invoices','Other invoices','Available','Refund change'],
        r.receipts.map(x=>[x.reference,cashDate(x.receivedDate),cashDate(x.accountingDate),cashCurrency(x.currency),x.amount,x.classification.replaceAll('_',' ').toLowerCase(),x.plannedInvoiceAllocation,x.otherInvoiceAllocation,x.current.available,x.refundChange]))+
      '<h3>Original allocation, credit and void events</h3>'+table(['Date','Kind','Invoice','Currency','Amount','Cash date','Reason'],
        r.events.map(x=>[cashDate(x.date),x.kind.replaceAll('_',' ').toLowerCase(),x.invoiceNumber,cashCurrency(x.currency),x.amount,x.receivedDate?cashDate(x.receivedDate):'',x.reason]))+
      '<h3>Source changes</h3>'+(r.issues.length?r.issues.map(x=>'<p class="notice">'+e(x.invoiceNumber+' · '+x.message)+'</p>').join(''):'<p>No opening invoice basis changed.</p>')+
      '<details><summary>Interpretation and original source scope</summary><ul>'+Object.values(r.policy).map(x=>'<li>'+e(x)+'</li>').join('')+'</ul></details>';
  }
  async function loadList(){
    const n=++generation,ws=workspace();
    try{const result=await api.cashRealizations();if(n!==generation||ws!==workspace())return;list=result;error='';}
    catch(cause){if(n===generation&&ws===workspace()){list={realizations:[]};error=cause.message;}}
  }
  function render(){
    return '<section class="panel"><div class="panel-head"><div><h2>Realized receipts</h2><p class="small-text muted">Open a saved plan edition and choose Review actual receipts to retain its realization against the original account.</p></div>'+
      (draft?button('Continue unsaved review','continue','','data-write'):'')+'</div><div class="panel-body">'+
      (error?'<p class="notice error">'+e(error)+'</p>':'')+
      (list.realizations.length?'<div class="table-wrap"><table><thead><tr><th>Plan / edition</th><th>Opening / reviewed through</th><th>Saved by</th><th>Source changes</th></tr></thead><tbody>'+
        list.realizations.map(x=>'<tr><td>'+button(x.planTitle,'open',x.id,'class="link"')+'<span class="subline">Edition '+x.editionNumber+'</span></td>'+
          '<td>'+e(cashDate(x.baseDate))+'<span class="subline">'+e(cashDate(x.through))+'</span></td><td>'+e(x.actor)+
          '<span class="subline">'+e(cashDate(x.createdAt))+'</span></td><td>'+x.issueCount+'</td></tr>').join('')+'</tbody></table></div>':'<p>No realization review has been saved in this account.</p>')+'</div></section>';
  }
  function editor(){
    if(!draft||draft.workspaceId!==workspace())throw Error('Open this retained review in its original accounting workspace.');
    openDialog('Review actual receipts','<p>'+e(draft.title)+' · Original edition '+draft.editionNumber+' · Opening '+e(cashDate(draft.baseDate))+'</p>'+
      '<form id="cash-realization-form"><label>Review through<input name="through" type="date" min="'+e(draft.baseDate)+'" value="'+e(draft.through)+'" required></label>'+
      '<label>Review note<textarea name="note" rows="3" maxlength="6000">'+e(draft.note)+'</textarea></label>'+
      '<div class="dialog-actions"><button type="submit" data-write>Recalculate realization</button>'+
      (preview?button('Save reviewed realization','save','','data-write'):'')+'</div></form>'+
      (preview?'<p id="cash-realization-review-state">Original accounting revision '+preview.revision+' · review through '+e(cashDate(preview.request.through))+'</p>'+body(preview.report):
        '<p>Recalculate to inspect all original invoice, receipt and correction records before saving.</p>'));
  }
  function remember(target){
    const form=target?.closest?.('#cash-realization-form');if(!form||!draft)return false;
    const values=Object.fromEntries(new FormData(form)),next={...draft,through:values.through,note:values.note};
    if(JSON.stringify(next)!==JSON.stringify(draft)){draft=next;preview=null;persist();
      const save=document.querySelector('[data-action="cash-realization-save"]');if(save)save.disabled=true;
      const status=document.querySelector('#cash-realization-review-state');if(status)status.textContent='Review changed. Recalculate before saving.';}
    return true;
  }
  async function start(planId,editionId){
    const ws=workspace(),n=++dialogGeneration,detail=await api.cashPlan(planId,{editionId});
    if(ws!==workspace()||n!==dialogGeneration)return;
    if(detail.workspaceId!==ws)throw Error('The selected plan belongs to another account.');
    const asOf=host.getAsOf(),edition=detail.edition;
    draft={workspaceId:ws,planId,editionId:edition.id,title:edition.plan.title,editionNumber:edition.number,
      baseDate:edition.plan.asOf,through:asOf<edition.plan.asOf?edition.plan.asOf:asOf,note:''};
    preview=null;persist();editor();
  }
  async function openSaved(id){
    const ws=workspace(),n=++dialogGeneration,result=await api.cashRealization(id);
    if(ws!==workspace()||n!==dialogGeneration)return;
    if(result.workspaceId!==ws)throw Error('The retained review belongs to another accounting workspace.');
    const row=result.realization,r=row.report;
    openDialog(r.plan.plan.title+' — realized receipts','<p>Original edition '+r.plan.number+' · Opening '+e(cashDate(r.baseDate))+' · Reviewed through '+
      e(cashDate(r.through))+'</p><p>Saved '+e(cashDate(row.createdAt))+' by '+e(row.actor)+' · Source revision '+row.sourceRevision+'</p>'+
      '<p class="preline">'+e(row.request.note)+'</p><div class="row wrap">'+
      button('Following review of this original edition','new',row.request.planId,'data-edition="'+e(row.request.editionId)+'" data-write')+
      fileNames.map(name=>button(name,'download',row.id,'data-name="'+name+'"')).join('')+'</div>'+body(r));
  }
  async function submit(form){
    if(form.id!=='cash-realization-form')return false;
    if(host.isLocked())throw Error('Complete the current account operation before preparing another review.');
    remember(form.querySelector('input'));const snapshot=structuredClone(draft),signature=JSON.stringify(snapshot),n=++dialogGeneration;
    host.setBusy(true);
    try{const result=await api.previewCashRealization({workspaceId:snapshot.workspaceId,planId:snapshot.planId,
      editionId:snapshot.editionId,through:snapshot.through,note:snapshot.note});
      if(n!==dialogGeneration||signature!==JSON.stringify(draft)||workspace()!==snapshot.workspaceId)return true;
      preview=result;editor();
    }finally{host.setBusy(false);}return true;
  }
  async function click(control){
    const action=control.dataset.action;if(!action?.startsWith('cash-realization-'))return false;
    if(host.isLocked()&&!['cash-realization-open','cash-realization-download'].includes(action))throw Error('Complete the retained account operation first.');
    if(action==='cash-realization-new')await start(control.dataset.id,control.dataset.edition);
    else if(action==='cash-realization-continue'){++dialogGeneration;preview=null;editor();}
    else if(action==='cash-realization-open')await openSaved(control.dataset.id);
    else if(action==='cash-realization-download'){
      const response=await api.cashRealizationFile(control.dataset.id,control.dataset.name);saveBlob(await response.blob(),control.dataset.name);
    }else if(action==='cash-realization-save'){
      const form=document.querySelector('#cash-realization-form');if(form)remember(form.querySelector('input'));
      if(!preview)throw Error('Recalculate and review the current source first.');
      await mutate('saveCashRealization',[{workspaceId:preview.workspaceId,...preview.request,reviewSha256:preview.reviewSha256}],
        'Save reviewed actual receipts',{revision:preview.revision});
    }
    return true;
  }
  return {methods,loadList,render,click,submit,input:remember,async afterMutation(result,operation){
    if(!methods.has(operation.method))return;
    draft=null;preview=null;persist();await loadList();host.render();
    if(result.cashRealization?.id)await openSaved(result.cashRealization.id);
  }};
}
