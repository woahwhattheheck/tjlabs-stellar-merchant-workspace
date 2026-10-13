// MIT. Complete saved-review comparison in the existing authenticated account.
import {cashDate,cashCurrency} from './cash-planning-display.mjs';
const e=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const label=value=>value.replace(/([A-Z])/g,' $1').replace(/^./,x=>x.toUpperCase());
const button=(title,action,more='')=>'<button type="button" data-action="cash-comparison-'+action+'" '+more+'>'+e(title)+'</button>';
const fileNames=['comparison.html','comparison.json','currencies.csv','invoices.csv','dates.csv','receipts.csv','source-changes.csv','manifest.json'];
const metricNames={plannedOpening:'Saved opening',openingCorrection:'Opening correction',allocationChange:'Allocation change',creditChange:'Credit change',
 lifecycleChange:'Invoice lifecycle change',currentBalance:'Current signed balance',currentAmountDue:'Current amount due',currentCreditBalance:'Current credit balance',
 expectedToDate:'Expected receipts to date',incomingAllocatedCash:'Incoming cash allocated to planned invoices',olderCashAllocationChange:'Earlier funds allocation change',
 incomingReceiptValue:'Original incoming receipt value',incomingUnallocatedValue:'Incoming funds available before pending refunds',receiptRefunds:'Recorded receipt refund change',
 unreconciledRefunds:'Unreconciled verified refunds',cashVariance:'Attributed cash less expected receipts'};
const table=(heads,rows)=>'<div class="table-wrap"><table><thead><tr>'+heads.map(x=>'<th>'+e(x)+'</th>').join('')+'</tr></thead><tbody>'+
 rows.map(cells=>'<tr>'+cells.map(x=>'<td>'+e(x)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
export function createCashRealizationComparisonUi(host,getList){
 const {api,openDialog,saveBlob}=host;let generation=0,report=null,selection=null,group='currencies',metric='currentBalance',page=0;
 const workspace=()=>host.getState()?.workspaceId;
 function chooser(leftId='',rightId=''){
  ++generation;report=null;
  const list=getList().realizations??[],options=value=>list.map(x=>'<option value="'+e(x.id)+'"'+(x.id===value?' selected':'')+'>'+
   e(x.planTitle+' / edition '+x.editionNumber+' / through '+x.through+' / saved '+x.createdAt+' / '+x.actor)+'</option>').join('');
  openDialog('Compare saved actual-receipt reviews','<p>Select two reviews of the same original forecast edition. The later through date must be on or after the earlier date. Saved time and source revision are retained separately.</p>'+
   '<form id="cash-comparison-select"><label>Earlier review<select name="leftId" required>'+options(leftId)+'</select></label>'+
   '<label>Later review<select name="rightId" required>'+options(rightId)+'</select></label><button type="submit">Compare complete reviews</button></form>');
 }
 async function compare(value){
  const ws=workspace(),n=++generation;host.setBusy(true);
  try{const result=await api.compareCashRealizations(value);if(n!==generation||ws!==workspace())return;
   if(result.workspaceId!==ws||result.selection.leftId!==value.leftId||result.selection.rightId!==value.rightId)throw Error('The returned comparison belongs to another original selection.');
   report=result;selection={...value};group='currencies';metric='currentBalance';page=0;render();
  }finally{host.setBusy(false);}
 }
 function render(){
  if(!report||report.workspaceId!==workspace())throw Error('Reopen the comparison in its original account.');
  const list=report[group],keys=list.length?Object.keys(list[0].metrics):[],selected=keys.includes(metric)?metric:(keys[0]??'');
  metric=selected;const size=100,pages=Math.max(1,Math.ceil(list.length/size));page=Math.max(0,Math.min(page,pages-1));
  const rows=list.slice(page*size,(page+1)*size);
  const groups=['currencies','invoices','dates','receipts'];
  openDialog('Saved actual-receipt comparison','<p>'+e(report.left.report.plan.plan.title)+' · Original edition '+report.left.report.plan.number+'</p>'+
   '<p>Earlier through '+e(cashDate(report.left.request.through))+' · saved '+e(cashDate(report.left.createdAt))+' by '+e(report.left.actor)+' · source revision '+report.left.sourceRevision+
   '<br>Later through '+e(cashDate(report.right.request.through))+' · saved '+e(cashDate(report.right.createdAt))+' by '+e(report.right.actor)+' · source revision '+report.right.sourceRevision+'</p>'+
   '<p class="notice">Earlier + source change + period movement = later. Period movement includes allocations, reversals, credits and refunds; it is not a new-cash total.</p>'+
   '<div class="row wrap">'+button('Choose reviews','choose')+fileNames.map(name=>button(name,'file','data-name="'+name+'"')).join('')+'</div>'+
   '<details><summary>Interpretation and complete original scope</summary><ul>'+Object.values(report.policy).map(x=>'<li>'+e(x)+'</li>').join('')+'</ul></details>'+
   '<form id="cash-comparison-display" class="row wrap"><label>Table<select name="group">'+groups.map(x=>'<option value="'+x+'"'+(group===x?' selected':'')+'>'+label(x)+'</option>').join('')+
   '</select></label><label>Measure<select name="metric">'+[...new Set([...Object.keys(metricNames),'expected','amount','plannedInvoiceAllocation','otherInvoiceAllocation','refundChange'])].map(x=>
    '<option value="'+x+'"'+(metric===x?' selected':'')+'>'+e(metricNames[x]??label(x))+'</option>').join('')+'</select></label><button type="submit">Show selected table</button></form>'+
   '<h3>'+e(metricNames[metric]??label(metric))+'</h3>'+table(['Record','Currency','Presence: earlier / restated / later','Earlier','Restated earlier','Later','Source change','Period movement','Total change'],
    rows.map(row=>{const x=row.metrics[metric];return [row.invoiceNumber??row.reference??row.date??row.id,cashCurrency(row.currency),
     [row.leftPresent,row.restatedLeftPresent,row.rightPresent].map(v=>v?'present':'absent').join(' / '),
     x.left,x.restatedLeft,x.right,x.sourceChange,x.periodChange,x.totalChange];}))+
   '<div class="row"><span>Rows '+(list.length?page*size+1:0)+'–'+Math.min(list.length,(page+1)*size)+' of '+list.length+'</span>'+
    button('Previous','page','data-page="'+(page-1)+'"'+(page===0?' disabled':''))+button('Next','page','data-page="'+(page+1)+'"'+(page+1>=pages?' disabled':''))+'</div>'+
   '<h3>Original source changes</h3>'+table(['Source','Unchanged','Added','Removed','Changed'],report.sourceChanges.map(x=>[x.kind,x.counts.unchanged,x.counts.added,x.counts.removed,x.counts.changed]))+
   report.sourceChanges.map(x=>'<details><summary>'+e(label(x.kind))+' · '+x.changes.length+' changed original records</summary>'+
    x.changes.map(change=>'<p>'+button(change.status+' '+change.id,'source','data-kind="'+x.kind+'" data-id="'+e(change.id)+'"')+
     '<span class="subline">Fields: '+e(change.fields.join(', '))+'</span></p>').join('')+'</details>').join(''));
 }
 function source(kind,id){
  const entry=report?.sourceChanges.find(x=>x.kind===kind)?.changes.find(x=>x.id===id);if(!entry)throw Error('Choose a changed original source record.');
  const resolve=pointer=>pointer?pointer.slice(1).split('/').reduce((value,key)=>value[key],report):undefined;
  const left=resolve(entry.leftPointer),right=resolve(entry.rightPointer);
  openDialog('Original '+kind+' record '+id,'<p>'+e(entry.status)+' · Changed fields: '+e(entry.fields.join(', '))+'</p>'+
   button('Return to complete comparison','return')+'<h3>Earlier original</h3><p>'+e(entry.leftPointer??'Absent')+'</p><pre>'+
   e(left===undefined?'This source record was absent.':JSON.stringify(left,null,2))+'</pre><h3>Later original</h3><p>'+e(entry.rightPointer??'Absent')+'</p><pre>'+
   e(right===undefined?'This source record was absent.':JSON.stringify(right,null,2))+'</pre>');
 }
 return {
  renderButton(){return (getList().realizations??[]).length>1?button('Compare saved reviews','choose'):'';},
  async submit(form){if(form.id==='cash-comparison-select'){await compare(Object.fromEntries(new FormData(form)));return true;}
   if(form.id==='cash-comparison-display'){const value=Object.fromEntries(new FormData(form));if(!['currencies','invoices','dates','receipts'].includes(value.group))throw Error('Choose an available table.');
    group=value.group;metric=value.metric;page=0;render();return true;}return false;},
  async click(control){const action=control.dataset.action;if(!action?.startsWith('cash-comparison-'))return false;
   if(action==='cash-comparison-choose')chooser(selection?.leftId,selection?.rightId);
   else if(action==='cash-comparison-page'){page=Number(control.dataset.page);if(!Number.isSafeInteger(page))throw Error('Choose a valid page.');render();}
   else if(action==='cash-comparison-return')render();
   else if(action==='cash-comparison-source')source(control.dataset.kind,control.dataset.id);
   else if(action==='cash-comparison-file'){if(!selection||report?.workspaceId!==workspace())throw Error('Open the original comparison first.');
    const selected={...selection},n=generation,ws=workspace(),response=await api.cashRealizationComparisonFile(control.dataset.name,selected),blob=await response.blob();
    if(n!==generation||ws!==workspace())return true;saveBlob(blob,control.dataset.name);}
   return true;
  }
 };
}
