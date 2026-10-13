// MIT. Comparison of two immutable actual-cash reviews through the original financial projector.
import {need,identifier,currencyKey,minor,money,json,sha,csv} from './core.mjs';
import {projectCashRealization} from './cash-realization.mjs';
export const CASH_COMPARISON_SCHEMA='stellar-forge.merchant-cash-realization-comparison.v1';
export const CASH_COMPARISON_METRICS={
 plannedOpening:'Saved opening',openingCorrection:'Opening correction',allocationChange:'Allocation change',creditChange:'Credit change',
 lifecycleChange:'Invoice lifecycle change',currentBalance:'Current signed balance',currentAmountDue:'Current amount due',
 currentCreditBalance:'Current credit balance',expectedToDate:'Expected receipts to date',incomingAllocatedCash:'Incoming cash allocated to planned invoices',
 olderCashAllocationChange:'Earlier funds allocation change',incomingReceiptValue:'Original incoming receipt value',
 incomingUnallocatedValue:'Incoming funds available before pending refunds',receiptRefunds:'Recorded receipt refund change',
 unreconciledRefunds:'Unreconciled verified refunds',cashVariance:'Attributed cash less expected receipts'
};
const invoiceMetrics=['plannedOpening','openingCorrection','allocationChange','creditChange','lifecycleChange','currentBalance','expectedToDate','incomingAllocatedCash','olderCashAllocationChange','cashVariance'];
const dateMetrics=['expected','incomingAllocatedCash','allocationChange','creditChange','cashVariance'];
const receiptMetrics=['amount','incomingReceiptValue','plannedInvoiceAllocation','otherInvoiceAllocation','incomingAllocatedCash','refundChange'];
const sourceKinds=['invoices','receipts','allocations','credits','refunds'];
const clone=value=>structuredClone(value);
const canonical=value=>JSON.stringify(value===null||typeof value!=='object'?value:Array.isArray(value)?value.map(x=>JSON.parse(canonical(x))):
 Object.fromEntries(Object.keys(value).sort().map(key=>[key,JSON.parse(canonical(value[key]))])));
const same=(a,b)=>canonical(a)===canonical(b);
function original(row){
 need(row?.schema==='stellar-forge.merchant-cash-realization-record.v1','INVALID_CASH_REALIZATION_COMPARISON','Choose two saved original realization reviews.');
 identifier(row.id,'realization review');
 need(row.workspaceId===row.report?.plan?.workspaceId&&same(row.request,row.report.request),'CASH_COMPARISON_SOURCE_CHANGED','The saved original review identity differs from its source.',409);
 const basis={workspaceId:row.workspaceId,revision:row.sourceRevision,request:row.request,report:row.report};
 need(sha(json(basis))===row.reviewSha256,'CASH_COMPARISON_SOURCE_CHANGED','The saved original review digest does not match its complete contents.',409);
 need(sha(json(row.report.source))===row.report.sourceSha256,'CASH_COMPARISON_SOURCE_CHANGED','The original account source digest differs.',409);
 const replay=projectCashRealization(row.report.source,row.report.plan,row.request);
 need(same(replay,row.report),'CASH_COMPARISON_SOURCE_CHANGED','The original source does not reproduce its complete saved review.',409);
 return row;
}
function indexed(rows,key,label){
 const map=new Map();
 for(const row of rows){const id=key(row);need(!map.has(id),'CASH_COMPARISON_DUPLICATE_SOURCE','The original '+label+' repeats an identity.',409);map.set(id,row);}
 return map;
}
function components(currency,a,b,c,key){
 const read=row=>row&&Object.hasOwn(row,key)?minor(row[key],currency,key,{signed:true}):0n;
 const left=read(a),restated=read(b),right=read(c);
 return {left:money(left,currency),restatedLeft:money(restated,currency),right:money(right,currency),
  sourceChange:money(restated-left,currency),periodChange:money(right-restated,currency),totalChange:money(right-left,currency)};
}
function rows(left,restated,right,key,metrics,label){
 const a=indexed(left,key,label),b=indexed(restated,key,label),c=indexed(right,key,label);
 return [...new Set([...a.keys(),...b.keys(),...c.keys()])].sort().map(id=>{
  const l=a.get(id),r=b.get(id),n=c.get(id),currency=clone((n??r??l).currency);
  need([l,r,n].filter(Boolean).every(x=>currencyKey(x.currency)===currencyKey(currency)),'CASH_COMPARISON_CURRENCY_CHANGED','An original '+label+' identity changed currency.',409);
  return {id,currency,leftPresent:!!l,restatedLeftPresent:!!r,rightPresent:!!n,
   metrics:Object.fromEntries(metrics.map(metric=>[metric,components(currency,l,r,n,metric)]))};
 });
}
function sourceChanges(left,right){
 return sourceKinds.map(kind=>{
  const a=indexed(left[kind],x=>identifier(x.id,kind+' source'),kind),b=indexed(right[kind],x=>identifier(x.id,kind+' source'),kind);
  const changes=[],counts={unchanged:0,added:0,removed:0,changed:0};
  for(const id of [...new Set([...a.keys(),...b.keys()])].sort()){
   const l=a.get(id),r=b.get(id);if(l&&r&&same(l,r)){counts.unchanged++;continue;}
   const status=!l?'ADDED':!r?'REMOVED':'CHANGED';counts[status.toLowerCase()]++;
   const fields=[...new Set([...Object.keys(l??{}),...Object.keys(r??{})])].sort().filter(name=>
    Object.hasOwn(l??{},name)!==Object.hasOwn(r??{},name)||(Object.hasOwn(l??{},name)&&!same(l[name],r[name])));
   changes.push({id,status,fields,leftSha256:l?sha(json(l)):null,rightSha256:r?sha(json(r)):null,
    leftPointer:l?'/left/report/source/'+kind+'/'+left[kind].indexOf(l):null,
    rightPointer:r?'/right/report/source/'+kind+'/'+right[kind].indexOf(r):null});
  }
  return {kind,counts,changes};
 });
}
export function compareCashRealizations(leftInput,rightInput){
 const left=original(leftInput),right=original(rightInput),a=left.report,c=right.report;
 need(left.workspaceId===right.workspaceId,'CASH_COMPARISON_WORKSPACE_CHANGED','Choose reviews from the same original accounting workspace.',409);
 need(left.request.planId===right.request.planId&&left.request.editionId===right.request.editionId&&same(a.plan,c.plan),
  'CASH_COMPARISON_FORECAST_CHANGED','Choose two reviews of the same immutable forecast edition. Use saved-plan comparison for different forecasts.',409);
 need(a.through<=c.through,'CASH_COMPARISON_DATE_ORDER','The later review date must be on or after the earlier review date.');
 const b=projectCashRealization(c.source,c.plan,{...left.request,through:a.through});
 const currencies=rows(a.currencies,b.currencies,c.currencies,x=>currencyKey(x.currency),Object.keys(CASH_COMPARISON_METRICS),'currency');
 const byInvoice=new Map(c.invoices.map(x=>[x.invoiceId,x]));
 const invoices=rows(a.invoices,b.invoices,c.invoices,x=>x.invoiceId,invoiceMetrics,'invoice').map(x=>{
  const info=byInvoice.get(x.id);need(info&&x.leftPresent&&x.restatedLeftPresent&&x.rightPresent,'CASH_COMPARISON_POPULATION_CHANGED','The immutable forecast invoice population differs.',409);
  return {...x,invoiceNumber:info.invoiceNumber,customerId:info.customerId,customerName:info.customerName};
 });
 const dates=rows(a.dates,b.dates,c.dates,x=>x.date+':'+currencyKey(x.currency),dateMetrics,'date').map(x=>({...x,date:x.id.slice(0,10)}));
 const receiptInfo=new Map([...a.receipts,...b.receipts,...c.receipts].map(x=>[x.receiptId,x]));
 const receipts=rows(a.receipts,b.receipts,c.receipts,x=>x.receiptId,receiptMetrics,'receipt').map(x=>{
  const info=receiptInfo.get(x.id);return {...x,reference:info.reference,customerId:info.customerId,receivedDate:info.receivedDate,
   accountingDate:info.accountingDate,voidDate:info.voidDate};
 });
 for(const row of [...currencies,...invoices])for(const side of ['left','restatedLeft','right','sourceChange','periodChange','totalChange']){
  const val=key=>minor(row.metrics[key][side],row.currency,key,{signed:true});
  need(val('plannedOpening')+val('openingCorrection')-val('allocationChange')-val('creditChange')+val('lifecycleChange')===val('currentBalance'),
   'CASH_COMPARISON_BRIDGE_MISMATCH','Every original, restated and difference balance bridge must reconcile.',409);
 }
 const {source:_source,plan:_plan,...restated}=b;
 const result={schema:CASH_COMPARISON_SCHEMA,workspaceId:left.workspaceId,
  selection:{leftId:left.id,rightId:right.id,planId:left.request.planId,editionId:left.request.editionId},
  left:clone(left),right:clone(right),restatedLeft:{...restated,sourcePointer:'/right/report/source',planPointer:'/right/report/plan'},
  policy:{direction:'All changes are right minus left. Both originals remain complete and immutable.',
   source:'Source change equals the earlier-date review recalculated from the right retained source minus the original earlier review.',
   period:'Period movement equals the right review minus its source restated at the earlier date. This can include later allocations, releases, credits, reversals and refunds; it is not a new-cash total.',
   order:'The review through dates must be ordered. Saving time and source revision remain separate observations; the right source is not assumed newer solely because its through date is later.',
   population:'Both reviews select the same original saved forecast edition and complete invoice population. Other customer receipt and refund records remain visible in their original scope.',
   dates:'Daily rows compare exact per-day amounts; they are not cumulative period totals. Presence is explicit when a date or receipt did not occur in one view.',
   sourceRecords:'Source changes reference each complete original record by JSON Pointer in this file. Changed top-level fields identify differences without replacing original values.'},
  currencies,invoices,dates,receipts,sourceChanges:sourceChanges(a.source,c.source)};
 need(Buffer.byteLength(json(result),'utf8')<=112*1024*1024,'CASH_COMPARISON_TOO_LARGE','This complete comparison exceeds the supported 112 MiB retained-source size.',413);
 return {...result,comparisonSha256:sha(json(result))};
}
export function receiveCashRealizationComparison(value){
 need(value?.schema===CASH_COMPARISON_SCHEMA,'INVALID_CASH_REALIZATION_COMPARISON','Open a complete original cash realization comparison.');
 const expected=compareCashRealizations(value.left,value.right);
 need(same(value,expected),'CASH_COMPARISON_SOURCE_CHANGED','The complete comparison differs from its retained original sources.',409);
 return expected;
}
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
export function cashRealizationComparisonCsv(report,kind){
 if(kind==='source-changes')return csv([['kind','id','status','changed fields','left sha256','right sha256','left JSON Pointer','right JSON Pointer'],
  ...report.sourceChanges.flatMap(group=>group.changes.map(row=>[group.kind,row.id,row.status,row.fields.join('; '),row.leftSha256??'',row.rightSha256??'',row.leftPointer??'',row.rightPointer??'']))]);
 need(['currencies','invoices','dates','receipts'].includes(kind),'CASH_COMPARISON_FILE_NOT_FOUND','Choose the complete comparison or a named comparison table.',404);
 return csv([['record','currency','precision','left present','restated left present','right present','metric','left','restated left','right','source change','period movement','total change'],
  ...report[kind].flatMap(row=>Object.entries(row.metrics).map(([metric,x])=>[row.id,row.currency.code,row.currency.scale,row.leftPresent,row.restatedLeftPresent,row.rightPresent,metric,
   x.left,x.restatedLeft,x.right,x.sourceChange,x.periodChange,x.totalChange]))]);
}
export function cashRealizationComparisonHtml(report){
 const e=esc,table=(heads,rows)=>'<div class="table-wrap"><table><thead><tr>'+heads.map(x=>'<th>'+e(x)+'</th>').join('')+'</tr></thead><tbody>'+
  rows.map(cells=>'<tr>'+cells.map(x=>'<td>'+e(x)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
 const sections=['currencies','invoices','dates','receipts'].map(kind=>'<h2>'+e(kind[0].toUpperCase()+kind.slice(1))+'</h2>'+
  table(['Record / currency','Measure','Earlier','Restated earlier','Later','Source change','Period movement','Total change'],
   report[kind].flatMap(row=>Object.entries(row.metrics).map(([metric,x])=>[(row.invoiceNumber??row.reference??row.date??row.id)+' / '+row.currency.code+' / '+row.currency.scale,
    CASH_COMPARISON_METRICS[metric]??metric,x.left,x.restatedLeft,x.right,x.sourceChange,x.periodChange,x.totalChange])))).join('');
 return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Saved cash review comparison</title>'+
  '<style>body{font:14px/1.5 system-ui;color:#222;margin:28px;max-width:1600px}table{border-collapse:collapse;width:100%}td,th{padding:8px;border-bottom:1px solid #bbb;text-align:left;vertical-align:top}.table-wrap{overflow:auto}pre{white-space:pre-wrap}@media print{tr{break-inside:avoid}}</style>'+
  '<h1>'+e(report.left.report.plan.plan.title)+' — saved cash review comparison</h1><p>Original forecast edition '+e(report.left.report.plan.number)+
  ' · Earlier review '+e(report.left.request.through)+' · Later review '+e(report.right.request.through)+'</p>'+
  '<p>Earlier: '+e(report.left.actor)+' · saved '+e(report.left.createdAt)+' · source revision '+e(report.left.sourceRevision)+
  '<br>Later: '+e(report.right.actor)+' · saved '+e(report.right.createdAt)+' · source revision '+e(report.right.sourceRevision)+'</p>'+
  '<h2>Reading this comparison</h2><ul>'+Object.values(report.policy).map(x=>'<li>'+e(x)+'</li>').join('')+'</ul>'+sections+
  '<h2>Complete original source changes</h2>'+table(['Source','Unchanged','Added','Removed','Changed'],report.sourceChanges.map(x=>[x.kind,x.counts.unchanged,x.counts.added,x.counts.removed,x.counts.changed]))+
  table(['Source / record','Status','Changed fields','Earlier original pointer','Later original pointer'],report.sourceChanges.flatMap(group=>group.changes.map(x=>[group.kind+' / '+x.id,x.status,x.fields.join(', '),x.leftPointer,x.rightPointer])))+
  '<p>The complete comparison.json includes both original saved reviews, all original source bytes represented as their retained JSON values, and the full recalculated earlier-date report. Use the named pointers to inspect exact original records.</p></html>';
}
export const CASH_COMPARISON_FILES=Object.freeze(['comparison.json','comparison.html','currencies.csv','invoices.csv','dates.csv','receipts.csv','source-changes.csv','manifest.json']);
export function cashRealizationComparisonFile(report,name){
 need(CASH_COMPARISON_FILES.includes(name),'CASH_COMPARISON_FILE_NOT_FOUND','Choose a complete original comparison file.',404);
 if(name==='comparison.json')return {name,type:'application/json; charset=utf-8',bytes:Buffer.from(json(report))};
 if(name==='comparison.html')return {name,type:'text/html; charset=utf-8',bytes:Buffer.from(cashRealizationComparisonHtml(report))};
 if(name!=='manifest.json')return {name,type:'text/csv; charset=utf-8',bytes:Buffer.from(cashRealizationComparisonCsv(report,name.slice(0,-4)))};
 const files={};
 for(const member of CASH_COMPARISON_FILES.filter(x=>x!=='manifest.json')){
  const file=cashRealizationComparisonFile(report,member);files[member]={bytes:file.bytes.length,sha256:sha(file.bytes)};
 }
 return {name,type:'application/json; charset=utf-8',bytes:Buffer.from(json({schema:'stellar-forge.merchant-cash-realization-comparison-files.v1',
  selection:report.selection,comparisonSha256:report.comparisonSha256,files}))};
}
export function cashRealizationComparisonFiles(report){return CASH_COMPARISON_FILES.map(name=>cashRealizationComparisonFile(report,name));}
