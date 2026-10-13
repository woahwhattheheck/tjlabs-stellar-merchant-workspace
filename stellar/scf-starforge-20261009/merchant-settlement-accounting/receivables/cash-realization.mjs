// MIT. Saved receipt plans reconciled against original dated account records.
import {need,plain,field,identifier,dateValue,currencyKey,minor,money,invoiceSummary,receiptSummary,allocationActive,json,sha,csv} from './core.mjs';
export const CASH_REALIZATION_SCHEMA='stellar-forge.merchant-cash-realization.v1';
const clone=value=>structuredClone(value);
const sum=(rows,fn)=>rows.reduce((total,row)=>total+fn(row),0n);
const between=(date,from,through)=>date>from&&date<=through;
const effectiveReceipt=(row,date)=>(row.accountingDate??row.receivedDate)<=date&&(!row.voidDate||row.voidDate>date);
function knownArray(data,key){need(Array.isArray(data[key]),'CASH_REALIZATION_SOURCE_INVALID','The original '+key+' source is missing.',409);return data[key];}
export function normalizeCashRealization(value){
  need(plain(value),'INVALID_CASH_REALIZATION','Choose a retained plan edition and review date.');
  return {planId:identifier(value.planId,'cash plan'),editionId:identifier(value.editionId,'cash-plan edition'),
    through:dateValue(value.through,'realization through date'),note:field(value.note??'','review note',6000,true)};
}
export function cashRealizationRows(data){
  need(data.cashRealizations===undefined||Array.isArray(data.cashRealizations),'INVALID_CASH_REALIZATION_REGISTER','The saved realization register is invalid.',409);
  return data.cashRealizations??[];
}
export function cashRealizationSource(data,edition){
  const ids=new Set(edition.projection.invoices.map(row=>row.id));
  const accounts=new Set(edition.projection.invoices.map(row=>row.customerId+':'+currencyKey(row.currency)));
  const allocations=knownArray(data,'allocations'),requiredReceipts=new Set(allocations.filter(row=>ids.has(row.invoiceId)).map(row=>row.receiptId));
  const receipts=knownArray(data,'receipts').filter(row=>requiredReceipts.has(row.id)||accounts.has(row.customerId+':'+currencyKey(row.currency)));
  const receiptIds=new Set(receipts.map(row=>row.id));
  return clone({schema:'stellar-forge.merchant-cash-realization-source.v1',
    invoices:knownArray(data,'invoices').filter(row=>ids.has(row.id)),
    credits:knownArray(data,'credits').filter(row=>ids.has(row.invoiceId)),receipts,
    allocations:allocations.filter(row=>ids.has(row.invoiceId)||receiptIds.has(row.receiptId)),
    // The native refund reader resolves cross-record adoption and transfer ownership.
    refunds:clone(data.refunds??[])});
}
export function projectCashRealization(data,edition,input){
  const request=normalizeCashRealization(input),baseDate=dateValue(edition.plan.asOf,'saved plan account date'),through=request.through;
  need(edition.id===request.editionId&&edition.planId===request.planId,'CASH_REALIZATION_EDITION_CHANGED','Open the selected original saved edition.',409);
  need(through>=baseDate&&Date.parse(through+'T00:00:00Z')-Date.parse(baseDate+'T00:00:00Z')<=3660*86400000,
    'INVALID_CASH_REALIZATION_PERIOD','Choose a review date from the saved account date through 3660 days later.');
  const source=cashRealizationSource(data,edition),invoiceIds=new Set(edition.projection.invoices.map(row=>row.id));
  need(invoiceIds.size===edition.projection.invoices.length,'CASH_REALIZATION_DUPLICATE_INVOICE','The saved plan repeats an original invoice.',409);
  const currentInvoices=new Map(source.invoices.map(row=>[row.id,row])),receiptMap=new Map(source.receipts.map(row=>[row.id,row]));
  const issues=[],invoices=[],events=[],receiptRows=[],groupMap=new Map(),dailyMap=new Map();
  function group(currency){
    const key=currencyKey(currency);if(!groupMap.has(key))groupMap.set(key,{currency:clone(currency),invoices:0,plannedOpening:0n,
      openingCorrection:0n,allocationChange:0n,creditChange:0n,lifecycleChange:0n,currentBalance:0n,currentAmountDue:0n,currentCreditBalance:0n,
      expectedToDate:0n,incomingAllocatedCash:0n,olderCashAllocationChange:0n,incomingReceiptValue:0n,incomingUnallocatedValue:0n,
      receiptRefunds:0n,unreconciledRefunds:0n});
    return groupMap.get(key);
  }
  function daily(currency,date,key,amount){
    if(date<baseDate||date>through)return;
    const id=currencyKey(currency)+':'+date;
    if(!dailyMap.has(id))dailyMap.set(id,{currency:clone(currency),date,expected:0n,incomingAllocatedCash:0n,allocationChange:0n,creditChange:0n});
    dailyMap.get(id)[key]+=amount;
  }
  const plannedByInvoice=new Map();
  for(const line of edition.projection.lines){
    need(invoiceIds.has(line.invoiceId),'CASH_REALIZATION_PLAN_CHANGED','A saved planning line has no original invoice.',409);
    const amount=minor(line.amount,line.currency);need(amount>=0n,'CASH_REALIZATION_PLAN_CHANGED','A saved planning line has an invalid amount.',409);
    plannedByInvoice.set(line.invoiceId,(plannedByInvoice.get(line.invoiceId)??0n)+amount);
    if(line.position==='WITHIN_HORIZON'&&line.expectedDate&&line.expectedDate<=through){
      group(line.currency).expectedToDate+=amount;daily(line.currency,line.expectedDate,'expected',amount);
    }
  }
  for(const saved of edition.projection.invoices){
    const currency=saved.currency,row=currentInvoices.get(saved.id),g=group(currency);
    need(row?.document,'CASH_REALIZATION_INVOICE_MISSING','The original invoice '+saved.id+' is not present in this account.',409);
    need(currencyKey(row.document.currency)===currencyKey(currency)&&row.document.customerId===saved.customerId,
      'CASH_REALIZATION_INVOICE_IDENTITY_CHANGED','The original invoice currency or customer differs from the saved plan.',409);
    const original=minor(saved.balance,currency);
    need(original===minor(saved.amountDue,currency)&&original>0n&&(plannedByInvoice.get(saved.id)??0n)===original,
      'CASH_REALIZATION_PLAN_CHANGED','The saved original balance and its complete planning allocation do not agree.',409);
    const opening=invoiceSummary(row,source,baseDate),current=invoiceSummary(row,source,through);
    const openingBalance=minor(opening.balance,currency),endBalance=minor(current.balance,currency),
      paidChange=minor(current.paid,currency)-minor(opening.paid,currency),
      creditChange=minor(current.credited,currency)-minor(opening.credited,currency),
      openingCorrection=openingBalance-original,lifecycleChange=endBalance-(openingBalance-paidChange-creditChange);
    const ownIssues=[];
    if(sha(json(row.document))!==saved.invoiceDocumentSha256)ownIssues.push({code:'INVOICE_DOCUMENT_CHANGED',message:'The current original invoice document differs from this frozen plan.'});
    if(['paid','credited','balance','amountDue','creditBalance','paymentStatus'].some(key=>opening[key]!==saved[key]))
      ownIssues.push({code:'OPENING_BASIS_CHANGED',message:'Later recorded or corrected source changes the account at the original plan date.'});
    let allocatedIncoming=0n,olderCashChange=0n;
    const originalAllocations=source.allocations.filter(item=>item.invoiceId===row.id);
    for(const allocation of originalAllocations){
      const receipt=receiptMap.get(allocation.receiptId);
      need(receipt&&currencyKey(receipt.currency)===currencyKey(currency)&&receipt.customerId===saved.customerId,
        'CASH_REALIZATION_RECEIPT_MISSING','The original allocation must retain its same-customer receipt and currency.',409);
      const amount=minor(allocation.amount,currency),startActive=allocationActive(allocation,baseDate),endActive=allocationActive(allocation,through);
      const change=(endActive?amount:0n)-(startActive?amount:0n);
      if(receipt.receivedDate<=baseDate)olderCashChange+=change;
      if(endActive&&effectiveReceipt(receipt,through)&&between(receipt.receivedDate,baseDate,through))allocatedIncoming+=amount;
      for(const [kind,date,units] of [['ALLOCATION',allocation.allocatedDate,amount],['ALLOCATION_RELEASE',allocation.releasedDate,-amount]]){
        if(!date||!between(date,baseDate,through))continue;
        events.push({kind,date,invoiceId:row.id,invoiceNumber:saved.number,customerId:saved.customerId,currency:clone(currency),
          amount:money(units,currency),allocationId:allocation.id,receiptId:receipt.id,receivedDate:receipt.receivedDate,
          accountingDate:receipt.accountingDate??receipt.receivedDate,reason:allocation.releaseReason??allocation.reason??''});
        daily(currency,date,'allocationChange',units);
      }
    }
    for(const credit of source.credits.filter(item=>item.invoiceId===row.id&&between(item.document.creditDate,baseDate,through))){
      const amount=minor(credit.document.totals.total,currency);
      events.push({kind:'CREDIT',date:credit.document.creditDate,invoiceId:row.id,invoiceNumber:saved.number,customerId:saved.customerId,
        currency:clone(currency),amount:money(amount,currency),creditId:credit.id,reason:credit.document.reason??''});
      daily(currency,credit.document.creditDate,'creditChange',amount);
    }
    if(row.voidDate&&between(row.voidDate,baseDate,through))events.push({kind:'INVOICE_VOID',date:row.voidDate,invoiceId:row.id,
      invoiceNumber:saved.number,customerId:saved.customerId,currency:clone(currency),amount:money(lifecycleChange,currency),reason:row.voidReason??''});
    const expected=sum(edition.projection.lines.filter(item=>item.invoiceId===row.id&&item.position==='WITHIN_HORIZON'&&item.expectedDate<=through),item=>minor(item.amount,currency));
    const record={invoiceId:row.id,invoiceNumber:saved.number,customerId:saved.customerId,customerName:saved.customerName,currency:clone(currency),
      saved:clone(saved),opening,current,plannedOpening:money(original,currency),openingCorrection:money(openingCorrection,currency),
      allocationChange:money(paidChange,currency),creditChange:money(creditChange,currency),lifecycleChange:money(lifecycleChange,currency),
      currentBalance:money(endBalance,currency),expectedToDate:money(expected,currency),incomingAllocatedCash:money(allocatedIncoming,currency),
      olderCashAllocationChange:money(olderCashChange,currency),cashVariance:money(allocatedIncoming-expected,currency),issues:ownIssues};
    invoices.push(record);issues.push(...ownIssues.map(issue=>({...issue,invoiceId:row.id,invoiceNumber:saved.number})));
    g.invoices++;
    for(const [key,value] of Object.entries({plannedOpening:original,openingCorrection,allocationChange:paidChange,creditChange,lifecycleChange,
      currentBalance:endBalance,currentAmountDue:minor(current.amountDue,currency),currentCreditBalance:minor(current.creditBalance,currency),
      incomingAllocatedCash:allocatedIncoming,olderCashAllocationChange:olderCashChange}))g[key]+=value;
  }
  for(const receipt of source.receipts){
    const currency=receipt.currency,g=group(currency),start=receiptSummary(receipt,source,baseDate),current=receiptSummary(receipt,source,through),
      units=minor(receipt.amount,currency),active=effectiveReceipt(receipt,through),
      isIncoming=between(receipt.receivedDate,baseDate,through)&&active;
    const allocations=source.allocations.filter(row=>row.receiptId===receipt.id&&allocationActive(row,through));
    const selected=sum(allocations.filter(row=>invoiceIds.has(row.invoiceId)),row=>minor(row.amount,currency));
    const other=sum(allocations.filter(row=>!invoiceIds.has(row.invoiceId)),row=>minor(row.amount,currency));
    need(!selected||active,'CASH_REALIZATION_INACTIVE_RECEIPT','An active invoice allocation refers to an ineffective receipt.',409);
    if(isIncoming){
      g.incomingReceiptValue+=units;g.incomingUnallocatedValue+=minor(current.availableBeforeUnreconciledRefunds,currency);
      daily(currency,receipt.receivedDate,'incomingAllocatedCash',selected);
    }
    const refunded=minor(current.refunded,currency)-minor(start.refunded,currency);
    g.receiptRefunds+=refunded;g.unreconciledRefunds+=minor(current.unreconciledRefundAmount,currency);
    receiptRows.push({receiptId:receipt.id,reference:receipt.reference,customerId:receipt.customerId,currency:clone(currency),
      receivedDate:receipt.receivedDate,accountingDate:receipt.accountingDate??receipt.receivedDate,voidDate:receipt.voidDate??null,
      classification:isIncoming?'NEW_INCOMING_CASH':receipt.receivedDate<=baseDate?'EARLIER_RECEIPT':'OUTSIDE_REVIEW_OR_REVERSED',
      amount:receipt.amount,incomingReceiptValue:money(isIncoming?units:0n,currency),plannedInvoiceAllocation:money(active?selected:0n,currency),
      otherInvoiceAllocation:money(active?other:0n,currency),incomingAllocatedCash:money(isIncoming?selected:0n,currency),
      refundChange:money(refunded,currency),opening:start,current,allocationIds:allocations.map(row=>row.id)});
  }
  const totals=[...groupMap.values()].sort((a,b)=>currencyKey(a.currency).localeCompare(currencyKey(b.currency))).map(row=>{
    need(row.plannedOpening+row.openingCorrection-row.allocationChange-row.creditChange+row.lifecycleChange===row.currentBalance,
      'CASH_REALIZATION_BRIDGE_MISMATCH','The original account balance bridge did not reconcile.',409);
    return {...Object.fromEntries(Object.entries(row).map(([key,value])=>[key,typeof value==='bigint'?money(value,row.currency):value])),
      cashVariance:money(row.incomingAllocatedCash-row.expectedToDate,row.currency)};
  });
  const dailyRows=[...dailyMap.values()].sort((a,b)=>a.date.localeCompare(b.date)||currencyKey(a.currency).localeCompare(currencyKey(b.currency)));
  const running=new Map(),dates=dailyRows.map(row=>{
    const key=currencyKey(row.currency),c=running.get(key)??{expected:0n,incomingAllocatedCash:0n};
    c.expected+=row.expected;c.incomingAllocatedCash+=row.incomingAllocatedCash;running.set(key,c);
    return {...Object.fromEntries(Object.entries(row).map(([name,value])=>[name,typeof value==='bigint'?money(value,row.currency):value])),
      cashVariance:money(row.incomingAllocatedCash-row.expected,row.currency),cumulativeExpected:money(c.expected,row.currency),
      cumulativeIncomingAllocatedCash:money(c.incomingAllocatedCash,row.currency),cumulativeVariance:money(c.incomingAllocatedCash-c.expected,row.currency)};
  });
  events.sort((a,b)=>a.date.localeCompare(b.date)||a.invoiceId.localeCompare(b.invoiceId)||a.kind.localeCompare(b.kind)||String(a.allocationId??a.creditId??'').localeCompare(String(b.allocationId??b.creditId??'')));
  receiptRows.sort((a,b)=>a.receivedDate.localeCompare(b.receivedDate)||a.receiptId.localeCompare(b.receiptId));
  return {schema:CASH_REALIZATION_SCHEMA,request,plan:clone(edition),baseDate,through,
    policy:{baseline:'The saved account date is the opening end-of-day balance. Later cash has a received date strictly after it.',
      cash:'Incoming receipt value currently allocated to the original planned invoices, dated by actual receivedDate. Allocation choices are observed at the review through date.',
      corrections:'Receipt accountingDate, reversals, releases, credits and invoice voids remain distinct. Backdated source is an opening correction.',
      attribution:'No cash is assigned to an individual forecast installment or promise. Other customer receipts, other-invoice allocations and unused funds remain visible separately.',
      refunds:'Receipt refund changes and verified outstanding refunds are customer-receipt context, not inferred offsets to an individual planned invoice.',
      periods:'Expected receipts keep their original saved dates and horizon; later actual cash remains visible through the selected review date.'},
    source,sourceSha256:sha(json(source)),invoices,receipts:receiptRows,events,dates,currencies:totals,issues};
}
export function cashRealizationSummary(row){
  return {id:row.id,planId:row.request.planId,editionId:row.request.editionId,planTitle:row.report.plan.plan.title,
    editionNumber:row.report.plan.number,baseDate:row.report.baseDate,through:row.request.through,createdAt:row.createdAt,actor:row.actor,
    sourceRevision:row.sourceRevision,reviewSha256:row.reviewSha256,currencies:clone(row.report.currencies),issueCount:row.report.issues.length,note:row.request.note};
}
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
export function cashRealizationCsv(report,kind='invoices'){
  const fields=kind==='dates'?['date','expected','incomingAllocatedCash','cashVariance','cumulativeExpected','cumulativeIncomingAllocatedCash','cumulativeVariance','allocationChange','creditChange']:
    kind==='events'?['kind','date','invoiceId','invoiceNumber','amount','allocationId','receiptId','receivedDate','accountingDate','creditId','reason']:
    kind==='receipts'?['receiptId','reference','customerId','receivedDate','accountingDate','voidDate','classification','amount','incomingReceiptValue','plannedInvoiceAllocation','otherInvoiceAllocation','incomingAllocatedCash','refundChange']:
    ['invoiceId','invoiceNumber','customerId','customerName','plannedOpening','openingCorrection','allocationChange','creditChange','lifecycleChange','currentBalance','expectedToDate','incomingAllocatedCash','olderCashAllocationChange','cashVariance'];
  const rows=report[kind];need(Array.isArray(rows),'CASH_REALIZATION_FILE_NOT_FOUND','Choose invoices, dates, events or receipts CSV.',404);
  return csv([['currency','precision',...fields],...rows.map(row=>[row.currency.code,row.currency.scale,...fields.map(key=>row[key]??'')])]);
}
export function cashRealizationHtml(row){
  const r=row.report,e=esc,table=(headers,rows)=>'<div class="table-wrap"><table><thead><tr>'+headers.map(x=>'<th>'+e(x)+'</th>').join('')+'</tr></thead><tbody>'+
    rows.map(cells=>'<tr>'+cells.map(x=>'<td>'+e(x)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
  return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>'+e(r.plan.plan.title)+' — receipt realization</title>'+
    '<style>body{font:14px/1.5 system-ui;color:#222;margin:28px;max-width:1500px}table{border-collapse:collapse;width:100%}td,th{padding:8px;border-bottom:1px solid #bbb;text-align:left;vertical-align:top}.table-wrap{overflow:auto}pre{white-space:pre-wrap}@media print{tr{break-inside:avoid}}</style>'+
    '<h1>'+e(r.plan.plan.title)+' — receipt realization</h1><p>Original edition '+e(r.plan.number)+' · Account date '+e(r.baseDate)+' · Reviewed through '+e(r.through)+
    ' · Source revision '+e(row.sourceRevision)+'</p><p>'+e(row.actor)+' · '+e(row.createdAt)+'</p><pre>'+e(row.request.note)+'</pre>'+
    '<h2>Planned receipts and attributed incoming cash</h2>'+table(['Currency','Expected to date','New incoming cash allocated','Cash less expected','Earlier cash allocation change','Current due'],
      r.currencies.map(x=>[x.currency.code+' / '+x.currency.scale,x.expectedToDate,x.incomingAllocatedCash,x.cashVariance,x.olderCashAllocationChange,x.currentAmountDue]))+
    '<h2>Original invoice balance bridge</h2><p>Saved opening + opening correction − allocation change − credit change + lifecycle change = current signed balance.</p>'+
    table(['Invoice','Customer','Currency','Saved opening','Opening correction','Allocation change','Credit change','Lifecycle change','Current balance'],
      r.invoices.map(x=>[x.invoiceNumber,x.customerName,x.currency.code,x.plannedOpening,x.openingCorrection,x.allocationChange,x.creditChange,x.lifecycleChange,x.currentBalance]))+
    '<h2>Dates and cumulative performance</h2>'+table(['Date','Currency','Expected','Attributed incoming cash','Cash less expected','Cumulative expected','Cumulative cash','Cumulative variance'],
      r.dates.map(x=>[x.date,x.currency.code,x.expected,x.incomingAllocatedCash,x.cashVariance,x.cumulativeExpected,x.cumulativeIncomingAllocatedCash,x.cumulativeVariance]))+
    '<h2>Original receipt inventory</h2>'+table(['Receipt','Cash date','Accounting date','Currency','Recorded value','Classification','Planned invoices','Other invoices','Available','Refund change'],
      r.receipts.map(x=>[x.reference,x.receivedDate,x.accountingDate,x.currency.code,x.amount,x.classification,x.plannedInvoiceAllocation,x.otherInvoiceAllocation,x.current.available,x.refundChange]))+
    '<h2>Allocation, credit and void history in this period</h2>'+table(['Kind','Date','Invoice','Currency','Amount','Receipt','Cash date','Reason'],
      r.events.map(x=>[x.kind,x.date,x.invoiceNumber,x.currency.code,x.amount,x.receiptId,x.receivedDate,x.reason]))+
    '<h2>Source changes</h2>'+(r.issues.length?'<ul>'+r.issues.map(x=>'<li>'+e(x.invoiceNumber+' · '+x.message)+'</li>').join('')+'</ul>':'<p>No changed opening invoice basis was found.</p>')+
    '<h2>Interpretation</h2><ul>'+Object.values(r.policy).map(x=>'<li>'+e(x)+'</li>').join('')+'</ul></html>';
}
export function cashRealizationFiles(row){
  const files=[{name:'realization.json',type:'application/json; charset=utf-8',bytes:Buffer.from(json(row))},
    {name:'realization.html',type:'text/html; charset=utf-8',bytes:Buffer.from(cashRealizationHtml(row))},
    ...['invoices','dates','events','receipts'].map(kind=>({name:kind+'.csv',type:'text/csv; charset=utf-8',bytes:Buffer.from(cashRealizationCsv(row.report,kind))}))];
  files.push({name:'manifest.json',type:'application/json; charset=utf-8',bytes:Buffer.from(json({
    schema:'stellar-forge.merchant-cash-realization-files.v1',realizationId:row.id,reviewSha256:row.reviewSha256,
    files:Object.fromEntries(files.map(file=>[file.name,{bytes:file.bytes.length,sha256:sha(file.bytes)}]))}))});
  return files;
}
