// SPDX-License-Identifier: MIT
// CAMT statement and entry review uses exact source strings and the existing UI.
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const list=value=>Array.isArray(value)?value:[];
const text=value=>value===undefined||value===null||value===''?'—':typeof value==='object'?JSON.stringify(value):String(value);
const json=value=>JSON.stringify(value,null,2);
const sourceValue=value=>{
  if(!value||typeof value!=='object')return value;
  if(Array.isArray(value.children))return value.text!==null&&value.text!==undefined?value.text:value.children.map(sourceValue).filter(Boolean).join(' / ');
  return value;
};
const pageText=value=>value?'Page '+text(value.page)+(value.last?' · final page':' · more pages'):null;
const pairs=values=>'<dl class="key-values">'+values.map(([name,value])=>'<dt>'+esc(name)+'</dt><dd>'+esc(text(value))+'</dd>').join('')+'</dl>';
const sourceDate=value=>value&&typeof value==='object'?(value.raw??value.date??value.timestamp??text(value)):value;
const amount=value=>value&&typeof value==='object'?text(value.amount)+' '+text(value.currency):text(value);
const expanded=(label,value)=>value===undefined||value===null?'':'<details><summary>'+esc(label)+'</summary><pre>'+esc(json(value))+'</pre></details>';
const table=(headers,rows)=>'<div class="table-wrap"><table><thead><tr>'+headers.map(value=>'<th>'+esc(value)+'</th>').join('')+'</tr></thead><tbody>'+
  (rows.length?rows.map(row=>'<tr>'+row.map(value=>'<td>'+esc(text(value))+'</td>').join('')+'</tr>').join(''):
    '<tr><td colspan="'+headers.length+'" class="empty">No records supplied.</td></tr>')+'</tbody></table></div>';

export function originalStatementRows(statement) {
  return [...list(statement?.rows),...list(statement?.pendingRows),
    ...list(statement?.excludedRows).flatMap(item=>item.row?.camt?[{...item.row,reason:item.reason}]:item.camt&&item.id&&item.source?[item]:[])]
    .sort((left,right)=>(left.source?.recordNumber??0)-(right.source?.recordNumber??0));
}
export function camtEntrySummary(row) {
  const value=row?.camt;if(!value)return '';
  const parts=[value.status?.code??value.status?.proprietary,value.creditDebit,
    value.reversal===true?'Reversal':null,
    list(value.details).length?list(value.details).length+' transaction details':null];
  return '<small>'+esc(parts.filter(value=>value!==null&&value!==undefined&&value!=='').map(text).join(' · '))+'</small>';
}
export function camtStatementHtml(report,statement) {
  if(!report?.camt&&!statement?.camt)return '';
  const message=report.camt||{},value=statement?.camt||{},check=value.balanceCheck;
  const excluded=statement?.camt?.unmappedCount??list(statement?.excludedRows).filter(row=>row.row?.camt||row.camt).length;
  let html='<section class="source-note mt15"><h3>CAMT.053 statement</h3>'+pairs([
    ['Message version',message.messageVersion],['Original XML elements',message.profile?.namespaceMode==='UNQUALIFIED'?'Unqualified; explicitly selected version':'Declared namespace'],
    ['Original namespace',message.namespace===''?'Empty in original XML':message.namespace],
    ['Booking reference identity',message.profile?.referencePolicy==='SOURCE_ENTRY'?'Separate source entries; overlaps require review':'Account-servicer reference'],['Message reference',message.messageId],
    ['Message created',sourceDate(message.messageCreated)],['Statement reference',value.statementId],
    ['Statement created',sourceDate(value.createdAt)],['Message pages',pageText(message.messagePagination)],
    ['Statement pages',pageText(value.pagination)],['Electronic sequence',value.sequences?.electronic],
    ['Legal sequence',value.sequences?.legal],['Reporting sequence',sourceValue(value.sequences?.reporting)],
    ['Copy / duplicate indicator',value.copyDuplicate],['Reporting source',sourceValue(value.reportingSource)],
    ['Information or other noncash entries',excluded],['Transaction detail treatment',value.detailPolicy]
  ]);
  if(check)html+='<h4 class="heading-gap">Original balance check</h4>'+pairs([
    ['Result',check.status],['Scope',check.scope],['Opening',check.opening],['Booked net',check.bookedNet],
    ['Calculated closing',check.expectedClosing],['Reported closing',check.reportedClosing],['Difference',check.difference]
  ]);
  const closings=list(statement?.balances?.closing);
  if(closings.length)html+=table(['Original close','Reporting dates','Currency','Available for close'],closings.map(row=>[
    row.kind,[row.from||'Unspecified',row.until||'Unspecified'].join(' to '),row.currency,row.eligible?'Yes':'Review original period, pages and balances'
  ]));
  html+=expanded('Original entry and batch summaries',value.summaryChecks);
  return html+'</section>';
}
function chargesHtml(charges) {
  if(!list(charges).length)return '';
  return '<div class="mt14"><h4>Reported charges</h4>'+list(charges).map((group,index)=>{
    const records=list(group.records);
    return '<div class="mt12">'+pairs([['Charge group',index+1],['Reported total',group.total?amount(group.total):group.totalRaw],
      ['Effect applied to entry amount',group.entryAmountAdjustment]])+
      table(['Charge','Currency','Direction','Included in entry amount','Type','Rate','Bearer'],records.map(row=>[
        row.amountRaw??row.amount,row.currency,row.creditDebit,
        row.included===true?'Yes':row.included===false?'No':'Unspecified',
        row.type?.code||sourceValue(row.type?.proprietary),row.rateRaw??row.rate,row.bearer
      ]))+
      expanded('Charge agents, tax and original source fields',group)+'</div>';
  }).join('')+'</div>';
}
function transactionDetailHtml(detail,index) {
  const references=list(detail.references),parties=list(detail.parties);
  return '<details class="mt12"><summary>Transaction detail '+index+
    (detail.selectedSignedAmount!==null&&detail.selectedSignedAmount!==undefined?' · '+esc(detail.selectedSignedAmount):'')+'</summary>'+
    pairs([['Group',detail.groupIndex],['Detail reference',detail.id],['Direction',detail.creditDebit],
      ['Direction basis',detail.directionBasis],['Selected signed amount',detail.selectedSignedAmount],['Tie-out',detail.tieOutStatus],
      ['Direct amount',detail.directAmount?amount(detail.directAmount):null]])+
    table(['Reference','Original value'],references.map(row=>[row.name,row.value]))+
    '<h4 class="heading-gap">Original parties</h4>'+table(['Role','Name','Account'],parties.map(row=>[row.role,row.name,sourceValue(row.account)]))+
    '<h4 class="heading-gap">Original amounts</h4>'+table(['Kind','Amount','Currency','Type','Exchange'],list(detail.amounts).map(row=>[
      row.kind,row.amountRaw??row.amount,row.currency,row.type,row.exchange
    ]))+
    expanded('Remittance and document references',detail.remittance)+
    expanded('Related agents and dates',{agents:detail.agents,relatedDates:detail.relatedDates})+
    expanded('Bank transaction and return information',{bankTransactionCode:detail.bankTransactionCode,
      returnInformation:detail.returnInformation,additionalInformation:detail.additionalInformation})+
    chargesHtml(detail.charges)+expanded('Complete original transaction detail',detail)+'</details>';
}
export function camtEntryHtml(row,options={}) {
  const value=row?.camt;if(!value)return '';
  const details=list(value.details),limit=25;
  const requested=Number(options.offset??0),offset=Number.isSafeInteger(requested)&&requested>=0&&requested<details.length?requested:0;
  const selected=details.slice(offset,offset+limit);
  let html='<div data-camt-entry data-camt-row="'+esc(row.id)+'" class="source-note mt14"><h3>Original CAMT entry</h3>'+
    pairs([['Entry reference',value.entryReference],['Account servicer reference',value.accountServicerReference],
      ['Source status',value.status?.code??value.status?.proprietary],['Current direction',value.creditDebit],
      ['Reversal indicator',value.reversal===true?'Yes':value.reversal===false?'No':'Unspecified'],
      ['Booking date',sourceDate(value.bookingDate)],['Value date',sourceDate(value.valueDate)],
      ['Detail treatment',value.detailTieOut?.policy],['Detail amount check',value.detailTieOut?.status]]);
  if(row.reason)html+=pairs([['Source exclusion reason',row.reason]]);
  html+=expanded('Original bank transaction code',value.bankTransactionCode)+
    expanded('Original detail amount check',value.detailTieOut)+expanded('Reported batch groups',value.batches)+
    chargesHtml(value.charges)+expanded('Original amount and return information',{amountDetails:value.amountDetails,returnInformation:value.returnInformation});
  if(details.length) {
    html+='<h4 class="heading-gap">Underlying transaction details</h4><p class="small muted">Showing '+
      (offset+1)+'–'+Math.min(offset+limit,details.length)+' of '+details.length+
      '. Each detail belongs to this original bank entry.</p>'+
      selected.map((detail,index)=>transactionDetailHtml(detail,offset+index+1)).join('');
    if(details.length>limit)html+='<div class="actions mt12"><button type="button" data-action="camt-entry-page" data-offset="'+Math.max(0,offset-limit)+'" '+(offset===0?'disabled':'')+
      '>Previous details</button><button type="button" data-action="camt-entry-page" data-offset="'+(offset+limit)+'" '+(offset+limit>=details.length?'disabled':'')+
      '>Next details</button></div>';
  }
  return html+'</div>';
}
