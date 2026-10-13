// MIT. Complete commissioning handovers retain source and native accounting identities.
import {json,csv} from '../core.mjs';
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const cell=value=>value===null||value===undefined?'':typeof value==='object'?json(value).trim():String(value);
const file=(name,value,role,type)=>{
  const content=typeof value==='string'?value:json(value);
  return {name,bytes:Buffer.from(content),role,type};
};
function link(value,label=value){
  try{
    const url=new URL(value);
    if((url.protocol==='https:'||url.protocol==='http:')&&!url.username&&!url.password)
      return '<a href="'+escape(url.href)+'" rel="noreferrer">'+escape(label)+'</a>';
  }catch{}
  return escape(label);
}
function table(headers,rows){
  return '<div class="table-wrap"><table><thead><tr>'+headers.map(value=>'<th>'+escape(value)+'</th>').join('')+
    '</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(value=>'<td>'+escape(cell(value))+'</td>').join('')+'</tr>').join('')+
    '</tbody></table></div>';
}
const style=String.raw`
:root{font-family:Arial,Helvetica,sans-serif;color:#171717;background:#fff;font-size:14px;line-height:1.5}
*{box-sizing:border-box}body{margin:0}main{max-width:1280px;margin:auto;padding:36px 32px}
header{border-bottom:2px solid #202020;padding-bottom:20px;margin-bottom:24px}
h1{font-size:28px;line-height:1.2;margin:0 0 10px}h2{font-size:21px;margin:30px 0 12px}
h3{font-size:16px;margin:20px 0 8px}p{max-width:105ch;margin:8px 0}.muted{color:#555}
.meta{display:grid;grid-template-columns:180px 1fr;gap:5px 18px;margin:14px 0}
.meta dt{font-weight:600}.meta dd{margin:0;overflow-wrap:anywhere}
.table-wrap{overflow:auto;margin:12px 0 22px}table{width:100%;border-collapse:collapse;font-size:12px}
th,td{border:1px solid #bbb;padding:8px 10px;text-align:left;vertical-align:top}
th{background:#ededed;font-weight:600;white-space:nowrap}td{overflow-wrap:anywhere}
article{border-top:1px solid #777;padding-top:8px;margin-top:30px}
code{font-family:ui-monospace,Consolas,monospace;font-size:12px;overflow-wrap:anywhere}
a{color:inherit;text-underline-offset:2px}details{border:1px solid #bbb;padding:10px;margin:12px 0}
summary{font-weight:600;cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px}
footer{border-top:2px solid #202020;padding-top:18px;margin-top:32px}
@media print{main{max-width:none;padding:0}.table-wrap{overflow:visible}article{break-before:auto}
th{background:#eee!important}tr{break-inside:avoid}details{break-inside:auto}a{text-decoration:none}}
`;
export function renderCommissioningFiles(review){
  const projectRows=[['project_id','project','customer_id','source_stage','currency','currency_scale','source_fee_net',
    'invoiced_net','invoiced_tax','allocated_gross','credited_net','credited_tax','amount_due_gross','credit_balance_gross',
    'unbilled_source_fee_net','billed_above_source_fee_net','received_gross','refunded_gross','reserved_refund_gross',
    'net_recorded_cash','reconciled_net_cash','original_owner','original_case_id','source_url']];
  const milestoneRows=[['project_id','milestone_index','original_condition','source_percentage','currency','source_fee_net',
    'accepted_date','planned_accepted_date','invoice_days','invoice_term_source','collection_delay_days','planned_invoice_due_date',
    'expected_collection_date','invoiced_net','invoiced_tax','allocated_gross','credited_net','credited_tax',
    'amount_due_gross','credit_balance_gross','unbilled_source_fee_net','invoice_bindings','original_allocation_ids','original_credit_ids']];
  for(const project of review.projects){
    const t=project.totals;
    projectRows.push([project.projectId,project.name,project.customerId,project.sourceStage,project.currency.code,project.currency.scale,
      project.sourceFee,t.invoicedNet,t.invoicedTax,t.allocatedGross,t.creditedNet,t.creditedTax,t.amountDueGross,t.creditBalanceGross,
      t.unbilledSourceNet,t.billedAboveSourceNet,t.receivedGross,t.refundedGross,t.reservedRefundGross,t.netRecordedCash,
      t.reconciledNetCash,project.owner,project.sourceCaseId,project.sourceUrl]);
    for(const milestone of project.milestones){
      const m=milestone.totals,d=milestone.dates;
      milestoneRows.push([project.projectId,milestone.index,milestone.condition,milestone.sourcePercentage,project.currency.code,m.sourceFeeNet,
        d.acceptedDate,d.plannedAcceptedDate,d.invoiceDays,d.invoiceTermSource,d.collectionDelayDays,d.plannedInvoiceDueDate,
        d.expectedCollectionDate,m.invoicedNet,m.invoicedTax,m.allocatedGross,m.creditedNet,m.creditedTax,m.amountDueGross,
        m.creditBalanceGross,m.unbilledSourceNet,json(milestone.bindings.map(row=>({invoiceId:row.invoiceId,invoiceLineId:row.invoiceLineId,
          invoiceSha256:row.invoiceSha256,netAmount:row.netAmount,taxAmount:row.taxAmount,status:row.status}))).trim(),
        milestone.allocations.map(row=>row.allocationId).join(' '),milestone.credits.map(row=>row.creditId+'/'+row.invoiceLineId).join(' ')]);
    }
  }
  const cashRows=[['project_id','kind','customer_id','currency','source_id','receipt_id','selected_amount','effective_amount','reserved_amount',
    'status','actual_bank_date','accounting_date','void_or_reversal_date','original_reference','original_method','source_kind','original_bank_sources']];
  for(const row of review.cash)cashRows.push([row.projectId,row.kind,row.customerId,row.currency.code,row.kind==='REFUND'?row.refundId:row.receiptId,
    row.receiptId,row.amount,row.effectiveAmount,row.reservedAmount??'',row.status,row.actualDate,row.accountingDate,
    row.voidDate??row.reversedDate,row.original?.reference,row.original?.method??row.original?.kind,
    row.original?.source?.kind,json(row.original?.bankSources??[]).trim()]);
  const findingRows=[['severity','code','project_id','milestone_index','message','original_context']];
  for(const row of review.findings){
    const context={...row};for(const key of ['severity','code','projectId','milestoneIndex','message'])delete context[key];
    findingRows.push([row.severity,row.code,row.projectId,row.milestoneIndex,row.message,json(context).trim()]);
  }
  const totalsTable=table(['Currency','Projects','Source fee net','Issued net','Issued tax','Allocated gross','Credits net / tax',
    'Invoice amount due','Cash received','Cash refunded','Net recorded cash'],review.currencies.map(group=>{
      const t=group.totals;return [group.currency.code+' / '+group.currency.scale,group.projects,t.sourceFeeNet,t.invoicedNet,t.invoicedTax,
        t.allocatedGross,t.creditedNet+' / '+t.creditedTax,t.amountDueGross,t.receivedGross,t.refundedGross,t.netRecordedCash];
    }));
  const articles=review.projects.map(project=>{
    const t=project.totals;
    const milestones=table(['Milestone / receiving condition','Source net','Recorded acceptance','Planned acceptance','Expected collection',
      'Issued net / tax','Allocated gross','Credit net / tax','Due gross'],project.milestones.map(row=>[
      (row.index+1)+'. '+row.condition,row.totals.sourceFeeNet,row.dates.acceptedDate,row.dates.plannedAcceptedDate,
      row.dates.expectedCollectionDate,row.totals.invoicedNet+' / '+row.totals.invoicedTax,row.totals.allocatedGross,
      row.totals.creditedNet+' / '+row.totals.creditedTax,row.totals.amountDueGross]));
    const bindings=project.milestones.flatMap(milestone=>milestone.bindings.map(row=>[
      milestone.index+1,row.invoiceNumber??row.invoiceId,row.invoiceLineId,row.status,row.netAmount,row.taxAmount,row.dueDate,row.invoiceSha256]));
    const collections=project.collectionCases.map(row=>[row.id??row.caseId,row.invoiceNumber??row.invoiceId,row.status,
      row.owner??row.terms?.owner,row.nextActionDate??row.terms?.nextActionDate,row.amountDue??row.invoice?.amountDue]);
    const cash=[...project.receipts,...project.refunds].map(row=>[row.kind,row.kind==='REFUND'?row.refundId:row.receiptId,row.status,row.amount,
      row.effectiveAmount,row.actualDate,row.accountingDate,row.original?.reference??'']);
    const xero=project.xeroCycles.map(row=>[row.cycleId,row.organisation,row.asOf,row.status,row.observationScope,
      row.documents.length,row.reviewSha256]);
    return '<article><h2>'+escape(project.name)+'</h2><dl class="meta">'+
      '<dt>Original project</dt><dd>'+escape(project.projectId)+'</dd>'+
      '<dt>Original scope</dt><dd>'+link(project.sourceUrl,project.sourceCaseId||project.sourceUrl)+'</dd>'+
      '<dt>Source owner and stage</dt><dd>'+escape(project.owner)+' · '+escape(project.sourceStage)+'</dd>'+
      '<dt>Native customer</dt><dd>'+escape(project.customer?.name??'Choose the original customer')+' · '+escape(project.customerId??'')+'</dd>'+
      '<dt>Accounting currency</dt><dd>'+escape(project.currency.code)+' / '+escape(project.currency.scale)+' decimal places</dd>'+
      '<dt>Original fee</dt><dd>'+escape(project.sourceFee)+' net</dd>'+
      '<dt>Unbilled original fee</dt><dd>'+escape(t.unbilledSourceNet)+' net</dd>'+
      '<dt>Recorded customer cash</dt><dd>'+escape(t.receivedGross)+' received · '+escape(t.refundedGross)+' refunded · '+
      escape(t.netRecordedCash)+' net recorded</dd></dl>'+milestones+
      '<h3>Original invoice lines</h3>'+table(['Milestone','Invoice','Line','State','Net portion','Tax portion','Original invoice due','Invoice JSON SHA-256'],bindings)+
      '<h3>Original customer cash</h3>'+table(['Kind','Original identity','State','Selected portion','Effective portion','Actual bank date','Accounting date','Original reference'],cash)+
      '<p class="muted">'+escape(project.cashAccountingScope)+'</p>'+
      '<h3>Original collection cases</h3>'+table(['Case','Invoice','State','Owner','Next action','Amount due'],collections)+
      '<h3>Saved Xero cash cycles</h3>'+table(['Saved cycle','Organisation','Account date','State','Date scope','Related documents','Original review SHA-256'],xero)+
      '<details><summary>Complete original source and exact native portions</summary><pre>'+escape(json(project))+'</pre></details></article>';
  }).join('');
  const html='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<title>'+escape(review.label)+'</title><style>'+style+'</style></head><body><main><header><h1>'+escape(review.label)+
    '</h1><p>Original scope, milestone collections and customer cash as of '+escape(review.asOf)+'.</p><dl class="meta">'+
    '<dt>Review state</dt><dd>'+escape(review.status)+'</dd><dt>Accounting owner</dt><dd>'+escape(review.workspaceId)+' · revision '+escape(review.revision)+
    '</dd><dt>Original source</dt><dd>'+escape(review.source.name)+' · '+escape(review.source.bytes)+' bytes</dd>'+
    '<dt>Source SHA-256</dt><dd><code>'+escape(review.source.sha256)+'</code></dd></dl></header>'+
    '<p>'+escape(review.summary)+'</p>'+totalsTable+
    '<p class="muted">Fees and invoice net/tax remain separate from allocation settlement and physical receipt/refund amounts. Actuals use their original currency; the planning desk keeps its own dated FX and cost assumptions.</p>'+
    '<h2>Items to review</h2>'+table(['Severity','Code','Project','Milestone','Original finding'],review.findings.map(row=>[
      row.severity,row.code,row.projectId,row.milestoneIndex===undefined?'':row.milestoneIndex+1,row.message]))+
    articles+'<h2>Changes from the saved baseline</h2>'+table(['Change','Original identity','Previous','Current'],review.changes.map(row=>[
      row.kind,row.key,cell(row.before),cell(row.after)]))+
    '<footer><p>Review SHA-256 <code>'+escape(review.previewSha256)+'</code></p>'+
    '<p>Source fingerprint <code>'+escape(review.sourceFingerprint)+'</code></p>'+
    '<p>'+escape(review.source.roundingRule)+'</p></footer></main></body></html>\n';
  return [
    file('commissioning-review.json',review,'commissioning-review','application/json; charset=utf-8'),
    file('commissioning-projects.csv',csv(projectRows),'commissioning-projects','text/csv; charset=utf-8'),
    file('commissioning-milestones.csv',csv(milestoneRows),'commissioning-milestones','text/csv; charset=utf-8'),
    file('commissioning-cash.csv',csv(cashRows),'commissioning-cash','text/csv; charset=utf-8'),
    file('commissioning-findings.csv',csv(findingRows),'commissioning-findings','text/csv; charset=utf-8'),
    file('commissioning-handover.html',html,'commissioning-handover','text/html; charset=utf-8'),
  ];
}
