// MIT. Shared readable collections view and complete offline/tabular exports.
const e = value => String(value ?? '').replace(/[&<>"']/g, ch =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const label = value => String(value ?? '').replaceAll('_', ' ').toLowerCase();
const amount = (value, currency) => e(currency.code + ' ' + value);
const rows = value => Array.isArray(value) ? value : [];
const dl = entries => '<dl class="collection-definitions">' + entries.map(([name, value]) =>
  '<div><dt>' + e(name) + '</dt><dd>' + e(value) + '</dd></div>').join('') + '</dl>';
function link(path, values) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || /[\\?#]/.test(path)) return '';
  return path + '?' + Object.entries(values).map(([key, value]) => encodeURIComponent(key) + '=' + encodeURIComponent(value)).join('&');
}
function totalsTable(totals) {
  if (!totals.length) return '<p>No issued invoice is effective on the selected date.</p>';
  return '<div class="collection-scroll"><table><caption>Effective issued invoices, grouped by currency and precision</caption>' +
    '<thead><tr><th>Currency</th><th>Invoices</th><th>Invoiced</th><th>Allocated payments</th><th>Credits</th>' +
    '<th>Amount due</th><th>Overdue</th><th>Credit balance</th></tr></thead><tbody>' +
    totals.map(row => '<tr><th>' + e(row.currency.code) + '<span class="collection-sub">Precision ' + row.currency.scale + '</span></th>' +
      '<td>' + row.invoiceCount + '</td>' + ['total','paid','credited','amountDue','overdue','creditBalance']
        .map(key => '<td class="collection-number">' + e(row[key]) + '</td>').join('') + '</tr>').join('') +
    '</tbody></table></div>';
}
function activityView(row) {
  const allocations = row.allocations.map(value => '<tr><td>' + e(value.receipt.reference || value.receiptId) +
    '<span class="collection-sub">Receipt ' + e(value.receiptId) + ' · received ' + e(value.receipt.receivedDate) +
    '</span></td><td>' + e(value.allocatedDate) + '</td><td>' + e(value.releasedDate || '—') +
    '</td><td class="collection-number">' + amount(value.amount, row.invoice.currency) +
    '</td><td>' + (value.effective ? 'Effective allocation' : value.allocatedDate > row.invoice.asOf ? 'Later allocation' : 'Released') +
    '</td></tr>').join('');
  const credits = row.credits.map(value => '<tr><td>' + e(value.number || value.id) +
    '<span class="collection-sub">' + e(value.id) + '</span></td><td>' + e(value.creditDate) +
    '</td><td class="collection-number">' + amount(value.total, value.currency) + '</td><td>' +
    e(value.reason) + '</td><td>' + (value.effective ? 'Effective credit' : 'Later credit') + '</td></tr>').join('');
  const bindings = row.billingLinks.map(value => '<li>Service months ' + e(value.startMonth) + '–' + e(value.endMonth) +
    '; original period ' + e(value.periodId) + '; billing ' + e(value.billingId) +
    '; original request ' + e(value.requestId) + '; quote source ' + e(value.sourceId) + '.</li>').join('');
  return '<details class="collection-provenance"><summary>Original allocations, credit notes and billing links</summary>' +
    '<h5>Receipt allocations</h5>' + (allocations ? '<div class="collection-scroll"><table><thead><tr>' +
      '<th>Original receipt</th><th>Allocated</th><th>Released</th><th>Amount</th><th>At selected date</th>' +
      '</tr></thead><tbody>' + allocations + '</tbody></table></div>' : '<p>No allocation is recorded for this invoice.</p>') +
    '<h5>Credit notes</h5>' + (credits ? '<div class="collection-scroll"><table><thead><tr>' +
      '<th>Credit</th><th>Effective date</th><th>Amount</th><th>Reason</th><th>At selected date</th>' +
      '</tr></thead><tbody>' + credits + '</tbody></table></div>' : '<p>No credit note is recorded for this invoice.</p>') +
    '<h5>Original billing relationships</h5><ul>' + bindings + '</ul></details>';
}
function invoiceView(row, report, links) {
  const invoice = row.invoice, href = link(links.receivablesPath, {
    workspaceId: report.workspaceId, invoiceId: invoice.id, asOf: report.asOf});
  return '<section class="collection-invoice"><div class="collection-heading"><h4>' +
    e(invoice.number || 'Unissued draft') + '</h4><span class="collection-status">' +
    e(label(invoice.paymentStatus)) + (invoice.overdueDays ? ' · ' + invoice.overdueDays + ' days overdue' : '') +
    '</span></div><p class="collection-muted">' + e(invoice.customerName || invoice.customerId) +
    ' · original invoice ' + e(invoice.id) + ' · version ' + invoice.version + '</p>' +
    dl([['Invoice date', invoice.issueDate], ['Actual payment due', invoice.dueDate],
      ['Document total', invoice.currency.code + ' ' + invoice.total],
      ['Allocated payments', invoice.currency.code + ' ' + invoice.paid],
      ['Credit notes', invoice.currency.code + ' ' + invoice.credited],
      ['Amount due', invoice.currency.code + ' ' + invoice.amountDue],
      ['Credit balance', invoice.currency.code + ' ' + invoice.creditBalance],
      ['Included in issued totals', row.effective ? 'Yes' : 'No — ' + label(invoice.paymentStatus)]]) +
    (row.currentPeriodIds.length ? '<p class="collection-muted">Current calendar period: ' +
      row.currentPeriodIds.map(e).join(', ') + '.</p>' :
      '<p class="collection-muted">Retained invoice history; this invoice is outside the current selected calendar periods.</p>') +
    (href ? '<p><a class="button-link small" href="' + e(href) + '">Open this original invoice</a></p>' : '') +
    activityView(row) + '</section>';
}
function periodsView(row) {
  return '<details class="collection-periods"><summary>Quoted billing calendar · ' + row.periods.length + ' periods</summary>' +
    '<p>These are the accepted quotation’s planned amounts and dates. An issued invoice can have reviewed changes; its actual values appear above. Service interval ends are exclusive.</p>' +
    (row.periods.length ? '<div class="collection-scroll"><table><thead><tr><th>Service period</th><th>Proposed invoice date</th>' +
      '<th>Proposed due date</th><th>Quoted amount</th><th>Billing status</th><th>Original invoice</th></tr></thead><tbody>' +
      row.periods.map(period => '<tr><td>' + e(period.startDate) + ' → ' + e(period.endDate) +
        '<span class="collection-sub">' + e(period.id) + '</span></td><td>' + e(period.issueDate) +
        '</td><td>' + e(period.dueDate) + '</td><td class="collection-number">' + amount(period.amount, period.currency) +
        '</td><td>' + e(label(period.status)) + '</td><td>' + e(period.invoiceNumber || period.invoiceId || 'Not prepared') +
        '</td></tr>').join('') + '</tbody></table></div>' : '<p>No current service period.</p>') +
    (row.pendingBillings.length ? '<h4>Original billing requests awaiting invoice continuation</h4><ul>' +
      row.pendingBillings.map(value => '<li>' + e(value.periodId) + ' · request ' + e(value.requestId) +
        ' · original invoice request ' + e(value.invoiceRequestId) + '</li>').join('') + '</ul>' : '') +
    '</details>';
}
export function collectionsView(report, links = {}) {
  return '<article class="agreement-collections"><header><h2>Service agreement collections</h2>' +
    '<p>Ledger date <strong>' + e(report.asOf) + '</strong> · accounting revision ' + report.revision +
    ' · ' + report.summary.agreements + ' selected agreements · ' + report.summary.invoices +
    ' retained invoices.</p><p class="collection-muted">Open balances use original invoice documents, payment allocations and credit notes. Quoted future periods remain separate.</p></header>' +
    totalsTable(report.totals) +
    (!report.agreements.length ? '<p>No agreements selected.</p>' : report.agreements.map(row => {
      const agreement = row.agreement;
      return '<section class="collection-agreement" id="collection-' + e(agreement.id) + '">' +
        '<div class="collection-heading"><h3>' + e(agreement.reference) + ' · ' + e(agreement.title) + '</h3>' +
        (links.controls ? '<button type="button" data-action="detail" data-id="' + e(agreement.id) + '">Open agreement</button>' : '') + '</div>' +
        '<p>' + e(agreement.customerName) + ' · ' + e(label(agreement.status)) + ' · ' +
        e(agreement.startDate) + ' → ' + e(agreement.endDate) + ' (end exclusive).</p>' +
        '<p class="collection-muted">Agreement ' + e(agreement.id) + ' · version ' + agreement.version + '</p>' +
        totalsTable(row.totals) +
        (row.invoices.length ? row.invoices.map(invoice => invoiceView(invoice, report, links)).join('') :
          '<p>No original invoice is linked to this agreement yet.</p>') +
        periodsView(row) +
        '<details><summary>Original quotation source identities</summary><ul>' +
        row.sources.map(source => '<li>Source ' + e(source.id) + ' · ' + e(source.quote?.title) +
          ' · source SHA-256 <code>' + e(source.sourceSha256) + '</code></li>').join('') +
        '</ul></details></section>';
    }).join('')) +
    '<footer><h3>Reading this review</h3><ul>' + report.basis.map(value => '<li>' + e(value) + '</li>').join('') +
    '</ul>' + dl([['Original accounting workspace', report.workspaceId], ['Review SHA-256', report.sha256]]) +
    '<p>The complete JSON and tabular exports retain all selected invoice, period, allocation and credit records.</p></footer></article>';
}
export const COLLECTIONS_CSS = '.agreement-collections{background:#fff;color:#202124;color-scheme:only light;font:15px/1.55 system-ui,sans-serif;overflow-wrap:anywhere}.agreement-collections *{box-sizing:border-box}.agreement-collections h2,.agreement-collections h3,.agreement-collections h4,.agreement-collections h5{color:#202124;line-height:1.25}.agreement-collections h2{font-size:24px}.agreement-collections h3{font-size:20px}.agreement-collections h4{font-size:17px}.agreement-collections h5{font-size:15px}.agreement-collections a{color:#202124;text-decoration:underline}.agreement-collections button{color:#202124;background:#fff;border:1px solid #888;padding:8px 12px;border-radius:3px}.collection-agreement{margin:28px 0;border-top:2px solid #777;padding-top:20px}.collection-invoice{border:1px solid #bbb;background:#fff;color:#202124;padding:16px;margin:16px 0}.collection-heading{display:flex;align-items:start;justify-content:space-between;gap:12px;flex-wrap:wrap}.collection-heading h3,.collection-heading h4{margin:0}.collection-status{border:1px solid #888;background:#f4f4f4;color:#202124;padding:3px 8px;font-size:13px}.collection-muted,.collection-sub{color:#505050}.collection-sub{display:block;font-size:12px}.collection-definitions{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin:16px 0}.collection-definitions dt{font-size:12px;color:#505050}.collection-definitions dd{margin:3px 0;font-variant-numeric:tabular-nums}.collection-scroll{overflow:auto;margin:12px 0}.agreement-collections table{border-collapse:collapse;width:100%;font-size:13px;background:#fff;color:#202124}.agreement-collections caption{text-align:left;color:#505050;padding:6px 0}.agreement-collections th,.agreement-collections td{border:1px solid #bbb;padding:8px;text-align:left;vertical-align:top}.agreement-collections th{background:#f1f1f1;color:#202124}.agreement-collections .collection-number{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.agreement-collections details{margin:12px 0}.agreement-collections summary{cursor:pointer;color:#202124;font-weight:600}.agreement-collections code{color:#202124;background:#f4f4f4;overflow-wrap:anywhere}.agreement-collections footer{border-top:1px solid #999;margin-top:28px;padding-top:16px}@media(max-width:600px){.collection-invoice{padding:10px}.collection-definitions{grid-template-columns:1fr 1fr;gap:10px}.agreement-collections h3{font-size:18px}}@media print{.collection-scroll{overflow:visible}.agreement-collections table{font-size:10px}.agreement-collections td,.agreement-collections th{padding:4px}.agreement-collections details>*{display:block!important}.agreement-collections summary{list-style:none}.agreement-collections button{display:none}.collection-invoice{break-inside:avoid}.agreement-collections h3,.agreement-collections h4{break-after:avoid}}';
export function collectionsHtml(report) {
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="color-scheme" content="light"><title>Service agreement collections · ' + e(report.asOf) +
    '</title><style>body{margin:32px auto;max-width:1200px;padding:0 20px;background:#fff;color:#202124}' +
    COLLECTIONS_CSS + '</style></head><body>' + collectionsView(report).replaceAll('<details>', '<details open>')
      .replaceAll('<details class=', '<details open class=') + '</body></html>\n';
}
const n = value => ({number: value});
function csvCell(value) {
  let text = value && typeof value === 'object' && 'number' in value ? String(value.number ?? '') : String(value ?? '');
  const numeric = value && typeof value === 'object' && 'number' in value && /^-?(0|[1-9]\d*)(?:\.\d+)?$/.test(text);
  if (!numeric && (/^\s*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text))) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function collectionsCsv(report, kind) {
  const common = ['workspace_id','revision','as_of','review_sha256','agreement_id','agreement_reference','agreement_version','customer_id'];
  const prefix = row => [report.workspaceId,n(report.revision),report.asOf,report.sha256,
    row.agreement.id,row.agreement.reference,n(row.agreement.version),row.agreement.customerId];
  let headers, records;
  if (kind === 'invoices') {
    headers = ['invoice_id','invoice_number','invoice_version','invoice_customer_id','currency','precision','invoice_date','actual_due_date',
      'document_total','allocated_paid','credited','balance','amount_due','credit_balance','payment_status','overdue_days','included_in_issued_totals','void_date','billing_ids','current_period_ids'];
    records = report.agreements.flatMap(row => row.invoices.map(item => {
      const v = item.invoice;
      return [...prefix(row),v.id,v.number,n(v.version),v.customerId,v.currency.code,n(v.currency.scale),v.issueDate,v.dueDate,
        ...['total','paid','credited','balance','amountDue','creditBalance'].map(key => n(v[key])),
        v.paymentStatus,n(v.overdueDays),item.effective,v.voidDate,item.billingLinks.map(link => link.billingId).join(';'),item.currentPeriodIds.join(';')];
    }));
  } else if (kind === 'periods') {
    headers = ['period_id','service_start','service_end_exclusive','months','proposed_invoice_date','proposed_due_date','currency','precision',
      'quoted_amount','billing_status','invoice_id','invoice_number','edition_id','source_id','billing_request_id'];
    records = report.agreements.flatMap(row => row.periods.map(v => [...prefix(row),v.id,v.startDate,v.endDate,n(v.periodCount),
      v.issueDate,v.dueDate,v.currency.code,n(v.currency.scale),n(v.amount),v.status,v.invoiceId,v.invoiceNumber,v.editionId,v.sourceId,v.billingRequestId]));
  } else if (kind === 'activity') {
    headers = ['invoice_id','kind','record_id','reference','effective_date','released_date','currency','precision','amount',
      'effective_at_date','receipt_id','receipt_received_date','reason'];
    records = report.agreements.flatMap(row => row.invoices.flatMap(item => [
      ...item.allocations.map(v => [...prefix(row),item.invoice.id,'ALLOCATION',v.id,v.receipt.reference,
        v.allocatedDate,v.releasedDate,item.invoice.currency.code,n(item.invoice.currency.scale),n(v.amount),v.effective,
        v.receiptId,v.receipt.receivedDate,v.releaseReason || v.reason]),
      ...item.credits.map(v => [...prefix(row),item.invoice.id,'CREDIT',v.id,v.number,v.creditDate,'',
        v.currency.code,n(v.currency.scale),n(v.total),v.effective,'','',v.reason])
    ]));
  } else throw new TypeError('Choose invoices, periods or activity CSV.');
  return [[...common,...headers],...records].map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
