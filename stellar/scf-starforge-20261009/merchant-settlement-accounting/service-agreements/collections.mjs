// MIT. Dated collections over the original agreement links and receivables ledger.
import {need, plain, identifier, dateValue, invoiceSummary, allocationActive,
  minor, money, currencyKey, json, sha} from '../receivables/core.mjs';
import {linkedInvoice} from './core.mjs';
import {collectionsHtml, collectionsCsv} from './public/collections.mjs';

export const COLLECTIONS_SCHEMA = 'stellar-forge.service-agreement-collections.v1';
const clone = value => structuredClone(value);
const FIELDS = ['total', 'paid', 'credited', 'balance', 'amountDue', 'creditBalance'];
export function collectionsSelection(agreements, options, context) {
  need(plain(options), 'INVALID_AGREEMENT_COLLECTIONS', 'Choose a collections review.');
  need(options.workspaceId === undefined || options.workspaceId === context.workspaceId,
    'AGREEMENT_WORKSPACE_CHANGED', 'Open the selected original accounting workspace.', 409);
  need(options.expectedRevision === undefined || Number.isSafeInteger(options.expectedRevision) &&
    options.expectedRevision >= 1 && options.expectedRevision === context.revision,
    'AGREEMENT_COLLECTIONS_CHANGED', 'The accounting records changed. Refresh the dated collections review.', 409);
  if (options.agreementIds === undefined) return agreements;
  need(Array.isArray(options.agreementIds) && options.agreementIds.length <= 2000 &&
    new Set(options.agreementIds).size === options.agreementIds.length,
    'INVALID_AGREEMENT_SELECTION', 'Choose up to 2,000 distinct original agreement IDs.');
  return options.agreementIds.map(id => {
    identifier(id, 'service agreement');
    const row = agreements.find(agreement => agreement.id === id);
    need(row, 'AGREEMENT_NOT_FOUND', 'A selected original agreement is unavailable.', 404);
    return row;
  });
}
function totals(invoices) {
  const groups = new Map();
  for (const row of invoices) {
    if (!row.effective) continue;
    const invoice = row.invoice, key = currencyKey(invoice.currency);
    if (!groups.has(key)) groups.set(key, {currency: clone(invoice.currency), invoiceCount: 0,
      overdueCount: 0, ...Object.fromEntries([...FIELDS, 'overdue'].map(name => [name, 0n]))});
    const group = groups.get(key); group.invoiceCount++;
    for (const name of FIELDS) group[name] += minor(invoice[name], invoice.currency, name, {signed: true});
    if (invoice.overdueDays > 0) { group.overdueCount++; group.overdue += minor(invoice.amountDue, invoice.currency); }
  }
  return [...groups.values()].map(group => ({...group,
    ...Object.fromEntries([...FIELDS, 'overdue'].map(name => [name, money(group[name], group.currency)]))}));
}
export function agreementCollections(agreements, data, context) {
  const asOf = dateValue(context.asOf, 'collections date'), seen = new Set();
  const rows = agreements.map(agreement => {
    const invoiceMap = new Map(), pendingBillings = [];
    for (const billing of agreement.billings) {
      const original = linkedInvoice(billing, data);
      const link = {billingId: billing.id, requestId: billing.requestId, invoiceRequestId: billing.invoiceRequestId,
        periodId: billing.periodId, startMonth: billing.startMonth, endMonth: billing.endMonth,
        issueDate: billing.issueDate, dueDate: billing.dueDate, periodCount: billing.periodCount,
        editionId: billing.editionId, sourceId: billing.sourceId, createdAt: billing.createdAt};
      if (!original) { pendingBillings.push(link); continue; }
      let row = invoiceMap.get(original.id);
      if (!row) {
        need(!seen.has(original.id), 'AGREEMENT_INVOICE_SHARED',
          'One original invoice is linked to more than one selected agreement. Review its original billing records.', 409);
        seen.add(original.id);
        const summary = invoiceSummary(original, data, asOf);
        const allocations = data.allocations.filter(value => value.invoiceId === original.id).map(value => {
          const receipt = data.receipts.find(item => item.id === value.receiptId);
          need(receipt, 'AGREEMENT_RECEIPT_CHANGED', 'An original allocation is missing its receipt.', 409);
          return {id: value.id, receiptId: value.receiptId, amount: value.amount,
            allocatedDate: value.allocatedDate, releasedDate: value.releasedDate ?? null,
            effective: allocationActive(value, asOf), actor: value.actor ?? null,
            reason: value.reason ?? null, releaseReason: value.releaseReason ?? null,
            receipt: {id: receipt.id, reference: receipt.reference ?? null, kind: receipt.source?.kind ?? null,
              method: receipt.method ?? null, sourceKey: receipt.sourceKey ?? null,
              receivedDate: receipt.receivedDate, amount: receipt.amount, currency: clone(receipt.currency),
              status: receipt.status, voidDate: receipt.voidDate ?? null}};
        });
        const credits = data.credits.filter(value => value.invoiceId === original.id).map(value => ({
          id: value.id, number: value.number, creditDate: value.document.creditDate,
          total: value.document.totals.total, currency: clone(value.document.currency),
          reason: value.document.reason, effective: value.document.creditDate <= asOf}));
        row = {invoice: summary, effective: summary.issued &&
          !['DRAFT', 'FUTURE', 'VOID'].includes(summary.paymentStatus),
          billingLinks: [], allocations, credits,
          currentPeriodIds: agreement.periods.filter(period => period.invoiceId === original.id).map(period => period.id)};
        invoiceMap.set(original.id, row);
      }
      row.billingLinks.push(link);
    }
    const invoices = [...invoiceMap.values()].sort((a, b) =>
      a.invoice.issueDate.localeCompare(b.invoice.issueDate) || a.invoice.id.localeCompare(b.invoice.id));
    return {agreement: {id: agreement.id, reference: agreement.reference, title: agreement.title,
      customerId: agreement.customerId, customerName: agreement.customerName, version: agreement.version,
      status: agreement.status, startDate: agreement.startDate, endDate: agreement.endDate},
      sources: clone(agreement.sources), periods: clone(agreement.periods), pendingBillings,
      invoices, totals: totals(invoices)};
  });
  const invoices = rows.flatMap(row => row.invoices);
  const report = {schema: COLLECTIONS_SCHEMA, workspaceId: context.workspaceId, revision: context.revision, asOf,
    basis: [
      'Invoice amounts and dated balances come from the original receivables invoiceSummary.',
      'Paid means receipt allocations effective on this date; releasing an allocation restores the original balance.',
      'Credit notes, issue dates and void dates use their original effective dates. Draft, future-issued and effective-void invoices are excluded from issued totals.',
      'Totals keep currency code and decimal precision separate. Unallocated customer money is not assigned to a contract.',
      'Agreement terms and invoice versions are the current retained records; the as-of date selects ledger effects and billing readiness, not a historical snapshot of earlier contract edits.',
      'Quoted calendar amounts and dates remain distinct from actual invoice documents and cash allocation. Service interval ends are exclusive.'
    ],
    selection: {agreementIds: rows.map(row => row.agreement.id)},
    agreements: rows, totals: totals(invoices),
    summary: {agreements: rows.length, invoices: invoices.length,
      effectiveInvoices: invoices.filter(row => row.effective).length,
      overdueInvoices: invoices.filter(row => row.invoice.overdueDays > 0).length,
      pendingBillings: rows.reduce((count, row) => count + row.pendingBillings.length, 0),
      draftInvoices: invoices.filter(row => row.invoice.paymentStatus === 'DRAFT').length,
      futureInvoices: invoices.filter(row => row.invoice.paymentStatus === 'FUTURE').length,
      voidInvoices: invoices.filter(row => row.invoice.paymentStatus === 'VOID').length}};
  return {...report, sha256: sha(json(report))};
}
export function collectionsFiles(report) {
  const files = [
    {name: 'collections.json', type: 'application/json; charset=utf-8', bytes: Buffer.from(json(report))},
    {name: 'collections.html', type: 'text/html; charset=utf-8', bytes: Buffer.from(collectionsHtml(report))},
    ...['invoices', 'periods', 'activity'].map(kind => ({name: kind + '.csv',
      type: 'text/csv; charset=utf-8', bytes: Buffer.from(collectionsCsv(report, kind))}))
  ];
  files.push({name: 'files.json', type: 'application/json; charset=utf-8', bytes: Buffer.from(json({
    schema: COLLECTIONS_SCHEMA, workspaceId: report.workspaceId, revision: report.revision,
    asOf: report.asOf, reportSha256: report.sha256,
    files: files.map(({name, bytes}) => ({name, bytes: bytes.length, sha256: sha(bytes)}))}))});
  return files;
}
