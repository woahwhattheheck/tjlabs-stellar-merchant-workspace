// MIT. TokenJunkieLabs. Complete local staff handover for retained original customer records.
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const href=x=>x.split('/').map(encodeURIComponent).join('/');
function humanDate(value){if(!value)return'—';const d=new Date(/^\d{4}-\d{2}-\d{2}$/.test(value)?value+'T12:00:00Z':value);
  return Number.isFinite(d.valueOf())?new Intl.DateTimeFormat('en',{dateStyle:'medium',timeZone:'UTC'}).format(d):String(value);}
function table(head,rows){return'<div class="scroll"><table><thead><tr>'+head.map(x=>'<th scope="col">'+esc(x)+'</th>').join('')+
  '</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';}
function link(path,label){return'<a href="'+esc(href(path))+'">'+esc(label)+'</a>';}
function files(rows){return'<ul class="files">'+rows.map(row=>'<li>'+link(row.path,row.label+' · '+row.path.split('/').at(-1))+
  '<small>'+new Intl.NumberFormat('en').format(row.bytes)+' bytes</small></li>').join('')+'</ul>';}
export function customerCaseHtml(selected,edition){
  const account=edition.records.accountData,deliveries=edition.records['customer-deliveries'],collections=edition.records.collections;
  const credit=edition.records['credit-control'];
  const invoiceRows=account.invoices.map(row=>[esc(row.number||'Draft invoice'),esc(row.currency.code+' '+row.total),
    esc(row.currency.code+' '+row.amountDue),esc(row.paymentStatus),esc(humanDate(row.dueDate))]);
  const collectionRows=collections.cases.map(row=>[link('staff/collections/'+row.id+'/case.html',row.title||row.invoice.number),
    esc(row.owner),esc(row.queueStatus.replaceAll('_',' ').toLowerCase()),esc(humanDate(row.actionDate)),
    esc(row.invoice.currency.code+' '+row.invoice.amountDue)]);
  const responseRows=deliveries.responses.map(row=>[esc(humanDate(row.responseDate)),esc(row.author.name),esc(row.status.toLowerCase()),
    esc(row.completed+' of '+row.items),link('staff/responses/'+row.id+'/merchant-review.html','Open complete staff review')]);
  const decisionRows=credit.decisions.map(row=>[esc(row.issuedNumber||row.purchaseOrder||'Draft invoice'),esc(row.status.toLowerCase()),
    esc(row.actor),esc(row.reason),link('staff/credit/'+row.id+'/decision.html','Open decision')]);
  const customerFiles=edition.files.filter(x=>x.audience==='customer'),staffFiles=edition.files.filter(x=>x.audience==='staff');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:; base-uri \'none\'; form-action \'none\'">'+
    '<title>'+esc(selected.title)+'</title><style>*{box-sizing:border-box}body{margin:0;background:#f4f4f4;color:#171717;font:15px/1.5 system-ui,sans-serif}'+
    'main{max-width:1160px;margin:auto;padding:28px}header,section{background:white;border:1px solid #ccc;padding:24px;margin-bottom:18px}'+
    'h1{font-size:28px;line-height:1.2;margin:0 0 12px}h2{font-size:19px;margin-top:0}p{max-width:84ch}a{color:inherit;text-underline-offset:3px}'+
    'nav{display:flex;gap:16px;flex-wrap:wrap}.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(125px,1fr));gap:12px}.metrics div{border-top:2px solid #444;padding:10px 0}'+
    '.metrics strong{display:block;font-size:24px}.scroll{overflow:auto}table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;padding:10px;border-bottom:1px solid #ddd;vertical-align:top}'+
    'th{white-space:nowrap}.files{padding-left:20px}.files li{margin:8px 0;overflow-wrap:anywhere}small{display:block;color:#555}.muted{color:#555}'+
    'details{margin-top:16px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.5 ui-monospace,monospace}.notice{border-left:3px solid #555;padding-left:15px}'+
    '@media(max-width:600px){main{padding:12px}header,section{padding:16px}h1{font-size:24px}th,td{padding:8px}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}}'+
    '@media print{body{background:white}main{max-width:none;padding:0}header,section{break-inside:avoid;border:0;border-bottom:1px solid #aaa}nav{display:none}}</style></head><body><main>'+
    '<header><p class="muted">TokenJunkieLabs · Merchant customer operations</p><h1>'+esc(selected.title)+'</h1><p>'+esc(edition.customer.name)+
    ' · Account as of '+esc(humanDate(edition.asOf))+' · Captured '+esc(humanDate(edition.createdAt))+'</p>'+
    '<nav aria-label="Case sections"><a href="#account">Account</a><a href="#followup">Follow-up</a><a href="#responses">Customer returns</a><a href="#decisions">Credit</a><a href="#delivery">Customer documents</a><a href="#staff">Staff records</a></nav></header>'+
    '<section><h2>Retained customer case</h2><div class="metrics">'+
    [['Invoices',edition.summary.invoices],['Published accounts',edition.summary.publications],['Returns to review',edition.summary.openResponses],
      ['Follow-up cases',edition.summary.collectionCases],['Cash-plan editions',edition.summary.cashPlanEditions],['Credit decisions',edition.summary.creditDecisions]]
      .map(([label,value])=>'<div><strong>'+esc(value)+'</strong>'+esc(label)+'</div>').join('')+
    '</div><p class="notice">This complete staff edition retains the original customer documents and accounting history at revision '+esc(edition.revision)+
    '. Continue editing in the existing merchant workspace; keep this edition alongside its successors.</p></section>'+
    '<section id="account"><h2>Customer account</h2>'+table(['Invoice','Total','Amount due','Status','Due date'],invoiceRows)+
    '<p>'+link('customer/current/account.html','Open dated account')+' · '+link('customer/current/account.tar','Download complete account package')+'</p></section>'+
    '<section id="followup"><h2>Assigned follow-up</h2>'+(collectionRows.length?table(['Case','Owner','Queue','Next action','Amount due'],collectionRows):
      '<p>No collection case is recorded for this customer on the selected date.</p>')+'</section>'+
    '<section id="responses"><h2>Customer returns and reviewed outcomes</h2>'+(responseRows.length?table(['Response date','Customer author','Status','Entries completed','Original review'],responseRows):
      '<p>No returned customer response is retained for this customer.</p>')+
    '<p>The customer document supports editable notes, payment notices, promises and disputes. Save the returned JSON, review the current invoice and retain the original prepared action before recording an outcome.</p></section>'+
    '<section id="decisions"><h2>Customer credit decisions</h2><p>Current policy context was observed on '+esc(humanDate(credit.asOf))+
    '. Each saved decision keeps its own assessment date and original invoice basis.</p>'+(decisionRows.length?table(['Invoice','Status','Operator','Reason','Original decision'],decisionRows):
      '<p>No customer credit decision is recorded.</p>')+'</section>'+
    '<section id="delivery"><h2>Customer documents</h2><p>Each published account retains its original date, invoice documents and customer response form. Send the selected complete publication directory or its account package.</p>'+files(customerFiles)+'</section>'+
    '<section id="staff"><h2>Staff records and planning</h2><p>Staff records include source invoices, original responses, reviewed outcomes, follow-up history and explicitly selected cash-plan editions. Planning editions retain their full source scope.</p>'+files(staffFiles)+
    '<details><summary>Original case and source references</summary><pre>'+esc(JSON.stringify({caseId:selected.id,editionId:edition.id,
      originalOperation:selected.originalOperation,workspaceId:edition.workspaceId,revision:edition.revision,customerId:selected.customerId,
      asOf:edition.asOf,selectionSha256:edition.selectionSha256},null,2))+'</pre></details></section>'+
    '<footer><p>'+link('edition.json','Complete machine-readable edition')+' · '+link('identity.json','Original selection identity')+'</p></footer></main></body></html>';
}
