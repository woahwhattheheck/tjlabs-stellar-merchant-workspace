// MIT. Exact remittance CSV planning over the existing receivables ledger.
import {need, plain, field, dateValue, currencyOf, currencyKey, minor, money, sha, json,
  customerSnapshot, invoiceSummary, receiptSummary, assertReceiptConservation,
  receiptUnreconciledRefunds, csv} from './core.mjs';

export const REMITTANCE_SCHEMA = 'stellar-forge.merchant-remittance-batch.v1';
export const REMITTANCE_REVIEW_SCHEMA = 'stellar-forge.merchant-remittance-review.v1';
export const REMITTANCE_MAX_BYTES = 500000;
export const REMITTANCE_MAX_ROWS = 1000;
export const REMITTANCE_COLUMNS = ['remittance_id','customer_reference','payment_reference',
  'payment_method','payment_date','currency','scale','payment_amount','invoice_number',
  'allocation_amount','allocation_date'];
const clone = value => structuredClone(value);
export function remittanceBatches(data) {
  need(data.remittanceBatches === undefined || Array.isArray(data.remittanceBatches),
    'INVALID_REMITTANCE_REGISTER', 'The saved remittance register is invalid.', 409);
  return data.remittanceBatches ?? [];
}
function stableId(value) {
  const chars = sha(json(value)).slice(0,32).split('');
  chars[12] = '8'; chars[16] = ((parseInt(chars[16],16) & 3) | 8).toString(16);
  const hex = chars.join('');
  return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}
/** RFC 4180 quoting with exact header names, LF/CRLF and an optional UTF-8 BOM. */
export function parseRemittanceCsv(value) {
  need(typeof value === 'string' && Buffer.byteLength(value,'utf8') > 0 &&
    Buffer.byteLength(value,'utf8') <= REMITTANCE_MAX_BYTES,
    'INVALID_REMITTANCE_CSV', 'Choose a UTF-8 remittance CSV of at most 500,000 bytes.');
  need(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),
    'INVALID_REMITTANCE_CSV', 'The remittance CSV contains unsupported control characters.');
  const text = value.startsWith('\ufeff') ? value.slice(1) : value;
  const records = []; let row = [], cell = '', quoted = false, closed = false, touched = false;
  const endCell = () => { row.push(cell); cell = ''; closed = false; touched = false; };
  const endRow = () => {
    endCell(); records.push(row); row = [];
    need(records.length <= REMITTANCE_MAX_ROWS + 1, 'REMITTANCE_ROW_LIMIT',
      'Use at most 1,000 remittance rows in one retained batch.');
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i+1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; }
      } else cell += char;
      continue;
    }
    if (char === ',') { endCell(); continue; }
    if (char === '\r' || char === '\n') {
      if (char === '\r') { need(text[i+1] === '\n','INVALID_REMITTANCE_CSV','Use LF or CRLF line endings.'); i++; }
      endRow(); continue;
    }
    need(!closed, 'INVALID_REMITTANCE_CSV', 'A closing quote must be followed by a comma or line ending.');
    if (char === '"') {
      need(!touched && cell === '', 'INVALID_REMITTANCE_CSV', 'Quote a complete CSV field and escape embedded quotes.');
      quoted = true; touched = true;
    } else { cell += char; touched = true; }
  }
  need(!quoted, 'INVALID_REMITTANCE_CSV', 'The remittance CSV ends inside a quoted field.');
  if (row.length || cell.length || touched || closed) endRow();
  need(records.length >= 2, 'EMPTY_REMITTANCE_CSV', 'Include the header and at least one remittance row.');
  const headers = records.shift();
  need(headers.length === REMITTANCE_COLUMNS.length && new Set(headers).size === headers.length &&
    REMITTANCE_COLUMNS.every(name => headers.includes(name)),
    'REMITTANCE_HEADER_MISMATCH', 'Use the documented eleven unique remittance column names.');
  return records.map((values,index) => {
    need(values.length === headers.length, 'REMITTANCE_COLUMN_MISMATCH',
      'CSV record ' + (index+2) + ' does not contain eleven fields.');
    return {record: index+2, value: Object.fromEntries(headers.map((name,i) => [name, values[i].trim()]))};
  });
}
function normalizedRow(row) {
  const input = row.value;
  const remittanceId = field(input.remittance_id,'remittance identifier',160);
  const customerReference = field(input.customer_reference,'customer reference',300);
  need(/^[0-6]$/.test(input.scale),'INVALID_REMITTANCE_PRECISION','Use an explicit precision from zero to six.');
  const currency = currencyOf({code:input.currency,scale:Number(input.scale)});
  const amount = money(minor(input.payment_amount,currency,'payment amount',{positive:true}),currency);
  const result = {record:row.record,remittanceId,customerReference,
    reference:field(input.payment_reference,'payment reference',300),
    method:field(input.payment_method,'payment method',100),
    receivedDate:dateValue(input.payment_date,'payment date'),currency,amount,allocation:null};
  const invoiceNumber = field(input.invoice_number,'invoice number',100,true);
  if (invoiceNumber) {
    result.allocation = {invoiceNumber,amount:money(minor(input.allocation_amount,currency,
      'allocation amount',{positive:true}),currency),allocatedDate:dateValue(input.allocation_date,'allocation date')};
  } else need(input.allocation_amount === '' && input.allocation_date === '',
    'REMITTANCE_ALLOCATION_INCOMPLETE','Leave all three allocation fields empty for an unapplied receipt.');
  return result;
}
function identity(row) {
  return {customerReference:row.customerReference,reference:row.reference,method:row.method.toLowerCase(),
    receivedDate:row.receivedDate,currency:row.currency,amount:row.amount};
}
function inputHash(rows) {
  return sha(json({identity:identity(rows[0]),allocations:rows.map(row => row.allocation)
    .sort((a,b) => json(a).localeCompare(json(b)))}));
}
function invoiceConservation(invoice,data) {
  const dates = new Map();
  for (const row of data.allocations.filter(item => item.invoiceId === invoice.id)) {
    const units = minor(row.amount,invoice.document.currency);
    dates.set(row.allocatedDate,(dates.get(row.allocatedDate) ?? 0n)+units);
    if (row.releasedDate) dates.set(row.releasedDate,(dates.get(row.releasedDate) ?? 0n)-units);
  }
  let allocated = 0n;
  for (const date of [...dates.keys()].sort()) {
    allocated += dates.get(date);
    need(allocated >= 0n && allocated <= minor(invoice.document.totals.total,invoice.document.currency),
      'INVOICE_ALREADY_ALLOCATED','This invoice already has payments committed during part of the selected date range.',409);
  }
}
export function remittanceSummary(batch) {
  return {id:batch.id,sourceId:batch.sourceId,filename:batch.filename,sourceSha256:batch.sourceSha256,
    appliedAt:batch.appliedAt,actor:batch.actor,sourceRevision:batch.sourceRevision,
    groupCount:batch.review.groups.length,allocationCount:batch.allocationIds.length,
    newReceiptCount:batch.newReceiptIds.length,reviewSha256:batch.reviewSha256};
}

/** Preview stages one copy of the original data. A conflict prevents the whole batch save. */
export function planRemittanceBatch(data,customers,value,context) {
  need(plain(value) && plain(context),'INVALID_REMITTANCE_REQUEST','Send the remittance source and workspace identity.');
  const sourceId = field(value.sourceId,'stable source identifier',160);
  const filename = field(value.filename,'source filename',240);
  need(!/[\\/\r\n]/.test(filename),'INVALID_REMITTANCE_FILENAME','Use the original filename without a path.');
  const records = parseRemittanceCsv(value.csv), sourceSha256 = sha(Buffer.from(value.csv,'utf8'));
  const groups = new Map(), errors = [];
  for (const record of records) {
    try {
      const row = normalizedRow(record);
      if (!groups.has(row.remittanceId)) groups.set(row.remittanceId,[]);
      groups.get(row.remittanceId).push(row);
    } catch (error) {
      errors.push({record:record.record,code:error.code ?? 'INVALID_REMITTANCE_ROW',message:error.message});
    }
  }
  const staged = clone(data);
  const reviews = [], newReceiptIds = [], allocationIds = [], changedInvoiceIds = [], changedReceiptIds = [];
  for (const [remittanceId,rows] of groups) {
    const first = rows[0];
    const receiptCount = staged.receipts.length, allocationCount = staged.allocations.length;
    const invoicePreimages = new Map(); let receiptPreimage = null;
    let groupNew = [], groupAllocations = [], groupInvoices = [], groupReceipts = [];
    const base = {remittanceId,records:rows.map(row => row.record),customerReference:first.customerReference,
      reference:first.reference,method:first.method,receivedDate:first.receivedDate,currency:first.currency,amount:first.amount};
    try {
      need(rows.every(row => json(identity(row)) === json(identity(first))),
        'REMITTANCE_PAYMENT_CHANGED','Every row for this remittance must repeat the same customer and payment identity.');
      const allocations = rows.filter(row => row.allocation);
      need(rows.length === 1 || allocations.length === rows.length,
        'REMITTANCE_EMPTY_ALLOCATION','Use one empty-allocation row or one row for each invoice.');
      need(new Set(allocations.map(row => row.allocation.invoiceNumber)).size === allocations.length,
        'DUPLICATE_REMITTANCE_INVOICE','List each invoice once in a remittance.');
      const sourceHash = inputHash(rows);
      const prior = remittanceBatches(data).flatMap(batch => batch.sourceId === sourceId
        ? batch.review.groups.filter(group => group.remittanceId === remittanceId &&
          group.status !== 'ALREADY_IMPORTED').map(group => ({batch,group})) : []);
      need(prior.length <= 1,'AMBIGUOUS_REMITTANCE_HISTORY','This remittance reference has conflicting retained imports.',409);
      if (prior.length) {
        need(prior[0].group.inputSha256 === sourceHash,'REMITTANCE_REFERENCE_CHANGED',
          'This source already used the remittance reference for different content. Correct its original allocation history.',409);
        reviews.push({...base,status:'ALREADY_IMPORTED',inputSha256:sourceHash,
          batchId:prior[0].batch.id,receiptId:prior[0].group.receiptId,allocations:clone(prior[0].group.allocations)});
        continue;
      }
      const matches = customers.filter(row => row.reference === first.customerReference);
      need(matches.length === 1,'REMITTANCE_CUSTOMER_UNRESOLVED',
        'Match the customer reference to exactly one saved accounting customer.',409);
      const customer = matches[0];
      const paymentKey = sha(json({kind:'OPERATOR_RECORDED',method:first.method.toLowerCase(),reference:first.reference}));
      const receipts = staged.receipts.filter(row => row.sourceKey === paymentKey ||
        row.method.toLowerCase() === first.method.toLowerCase() && row.reference === first.reference);
      need(receipts.length <= 1,'AMBIGUOUS_REMITTANCE_PAYMENT','More than one retained receipt has this payment identity.',409);
      let receipt = receipts[0], created = false;
      if (receipt) {
        const index = staged.receipts.indexOf(receipt);
        receiptPreimage = {index, record:receipt};
        receipt = clone(receipt); staged.receipts[index] = receipt;
        need(receipt.status === 'RECORDED' && !receipt.voidDate && receipt.customerId === customer.id &&
          currencyKey(receipt.currency) === currencyKey(first.currency) &&
          minor(receipt.amount,receipt.currency) === minor(first.amount,first.currency) &&
          receipt.receivedDate === first.receivedDate,
          'REMITTANCE_PAYMENT_CONFLICT','The existing receipt differs in customer, currency, amount, date or current status.',409);
      } else {
        const id = stableId({kind:'remittance-receipt',workspaceId:context.workspaceId,sourceId,remittanceId,paymentKey});
        need(!staged.receipts.some(row => row.id === id),'REMITTANCE_RECEIPT_ID_CONFLICT','Recover the original receipt with this identifier.',409);
        receipt = {id,customerId:customer.id,customer:customerSnapshot(customer),currency:clone(first.currency),
          amount:first.amount,receivedDate:first.receivedDate,method:first.method,reference:first.reference,note:'',
          sourceKey:paymentKey,source:{kind:'OPERATOR_RECORDED',remittance:{sourceId,remittanceId,sourceSha256}},
          createdAt:context.at ?? '',actor:context.actor ?? '',status:'RECORDED',
          history:[{at:context.at ?? '',actor:context.actor ?? '',action:'remittance_recorded',sourceId,remittanceId}]};
        staged.receipts.unshift(receipt); created = true; groupNew.push(id);
      }
      need(receiptUnreconciledRefunds(receipt,staged,'9999-12-31').length === 0,
        'UNRECONCILED_REFUND_RETURN','Receive this receipt’s verified outgoing return before allocating it.',409);
      const planned = [];
      for (const row of allocations) {
        const selected = row.allocation;
        const invoices = staged.invoices.filter(invoice => invoice.number === selected.invoiceNumber);
        need(invoices.length === 1,'REMITTANCE_INVOICE_UNRESOLVED','Match invoice ' + selected.invoiceNumber + ' to one issued document.',409);
        let invoice = invoices[0];
        need(invoice.status === 'ISSUED' && invoice.document && !invoice.voidDate,
          'REMITTANCE_INVOICE_CLOSED','Choose an issued current invoice.',409);
        need(invoice.document.customer.id === customer.id && currencyKey(invoice.document.currency) === currencyKey(first.currency),
          'REMITTANCE_INVOICE_IDENTITY','The invoice must belong to the exact customer, currency and precision.',409);
        need(selected.allocatedDate >= invoice.document.issueDate && selected.allocatedDate >= receipt.receivedDate &&
          selected.allocatedDate >= (receipt.accountingDate ?? receipt.receivedDate),
          'INVALID_ALLOCATION_DATE','Allocate on or after the invoice issue date and receipt accounting date.');
        const units = minor(selected.amount,first.currency,'allocation amount',{positive:true});
        const repeated = staged.allocations.find(item => item.invoiceId === invoice.id && item.receiptId === receipt.id &&
          item.allocatedDate === selected.allocatedDate && (!item.releasedDate || item.releasedDate > selected.allocatedDate) &&
          minor(item.amount,first.currency) === units);
        need(!repeated,'REMITTANCE_ALLOCATION_ALREADY_RECORDED',
          'This exact invoice, payment, amount and date already has allocation ' + (repeated?.id ?? '') +
          '. Review that original allocation; use the receivables desk for an intentional additional allocation.',409);
        const beforeInvoice = invoiceSummary(invoice,staged,selected.allocatedDate);
        const beforeReceipt = receiptSummary(receipt,staged,selected.allocatedDate);
        need(units <= minor(beforeInvoice.amountDue,first.currency) && units <= minor(beforeReceipt.available,first.currency),
          'ALLOCATION_EXCEEDS_BALANCE','The allocation exceeds the invoice amount due or receipt funds on its selected date.',409);
        const id = stableId({kind:'remittance-allocation',workspaceId:context.workspaceId,sourceId,remittanceId,
          invoiceId:invoice.id,receiptId:receipt.id,amount:selected.amount,date:selected.allocatedDate});
        need(!staged.allocations.some(item => item.id === id),'REMITTANCE_ALLOCATION_EXISTS','Recover the original allocation history for this remittance.',409);
        const allocation = {id,invoiceId:invoice.id,receiptId:receipt.id,customerId:customer.id,currency:clone(first.currency),
          amount:selected.amount,minorAmount:units.toString(),allocatedDate:selected.allocatedDate,releasedDate:null,
          createdAt:context.at ?? '',actor:context.actor ?? '',history:[{at:context.at ?? '',actor:context.actor ?? '',
            action:'allocated',allocatedDate:selected.allocatedDate,sourceId,remittanceId}]};
        staged.allocations.unshift(allocation);
        assertReceiptConservation(receipt,staged); invoiceConservation(invoice,staged);
        const invoiceIndex = staged.invoices.indexOf(invoice);
        invoicePreimages.set(invoiceIndex, invoice);
        invoice = clone(invoice); staged.invoices[invoiceIndex] = invoice;
        invoice.version++; invoice.updatedAt = context.at ?? '';
        invoice.history.push({at:context.at ?? '',actor:context.actor ?? '',action:'payment_allocated',
          allocationId:id,receiptId:receipt.id,amount:selected.amount,allocatedDate:selected.allocatedDate,sourceId,remittanceId});
        receipt.history.push({at:context.at ?? '',actor:context.actor ?? '',action:'allocated',allocationId:id,
          invoiceId:invoice.id,amount:selected.amount,allocatedDate:selected.allocatedDate,sourceId,remittanceId});
        planned.push({record:row.record,allocationId:id,invoiceId:invoice.id,invoiceNumber:invoice.number,
          invoiceVersion:beforeInvoice.version,allocatedDate:selected.allocatedDate,amount:selected.amount,
          amountDueBefore:beforeInvoice.amountDue,amountDueAfter:invoiceSummary(invoice,staged,selected.allocatedDate).amountDue,
          receiptAvailableBefore:beforeReceipt.available,receiptAvailableAfter:receiptSummary(receipt,staged,selected.allocatedDate).available});
        groupAllocations.push(id); groupInvoices.push(invoice.id);
      }
      groupReceipts.push(receipt.id);
      const dates = [first.receivedDate,...allocations.map(row => row.allocation.allocatedDate)].sort();
      const lastDate = dates.at(-1);
      reviews.push({...base,status:created ? 'READY_NEW_RECEIPT' : 'READY_EXISTING_RECEIPT',
        inputSha256:sourceHash,customerId:customer.id,customerName:customer.name,receiptId:receipt.id,
        receiptSourceKind:receipt.source.kind,sourceNetwork:receipt.source.network ?? null,
        sourceAmountAtomic:receipt.source.amountAtomic ?? null,sourceAssetDigest:receipt.source.assetDigest ?? null,
        transactionFingerprint:receipt.source.transactionFingerprint ?? null,
        availableAsOf:lastDate,availableAfter:receiptSummary(receipt,staged,lastDate).available,allocations:planned});
      newReceiptIds.push(...groupNew);allocationIds.push(...groupAllocations);
      changedInvoiceIds.push(...groupInvoices);changedReceiptIds.push(...groupReceipts);
    } catch (error) {
      // Undo only this group's writes; prior successful groups remain staged.
      staged.allocations.splice(0, staged.allocations.length - allocationCount);
      staged.receipts.splice(0, staged.receipts.length - receiptCount);
      if (receiptPreimage) staged.receipts[receiptPreimage.index] = receiptPreimage.record;
      for (const [index, invoice] of invoicePreimages) staged.invoices[index] = invoice;
      reviews.push({...base,status:'CONFLICT',code:error.code ?? 'REMITTANCE_CONFLICT',message:error.message,allocations:[]});
    }
  }
  const conflicts = reviews.filter(row => row.status === 'CONFLICT').length + errors.length;
  const review = {schema:REMITTANCE_REVIEW_SCHEMA,workspaceId:context.workspaceId,revision:context.revision,
    sourceId,filename,sourceSha256,sourceBytes:Buffer.byteLength(value.csv,'utf8'),recordCount:records.length,
    canApply:conflicts === 0,conflictCount:conflicts,newReceiptCount:newReceiptIds.length,
    allocationCount:allocationIds.length,alreadyImportedCount:reviews.filter(row => row.status === 'ALREADY_IMPORTED').length,
    groups:reviews,errors};
  return {review,reviewSha256:sha(json(review)),next:staged,newReceiptIds,
    allocationIds,invoiceIds:[...new Set(changedInvoiceIds)],receiptIds:[...new Set(changedReceiptIds)]};
}
export function remittanceReviewCsv(review) {
  return csv([['remittance_id','source_id','record','status','customer_reference','customer_id',
    'payment_reference','receipt_id','currency','scale','payment_amount','invoice_number','invoice_id',
    'allocation_amount','allocation_date','amount_due_after','code','message'],
    ...review.groups.flatMap(group => (group.allocations.length ? group.allocations : [{}]).map(row => [
      group.remittanceId,review.sourceId,row.record ?? group.records.join(' '),group.status,group.customerReference,
      group.customerId,group.reference,group.receiptId,group.currency.code,group.currency.scale,group.amount,
      row.invoiceNumber,row.invoiceId,row.amount,row.allocatedDate,row.amountDueAfter,group.code,group.message])),
    ...review.errors.map(error => ['',review.sourceId,error.record,'CONFLICT','','','','','','','','','','','','',error.code,error.message])]);
}
