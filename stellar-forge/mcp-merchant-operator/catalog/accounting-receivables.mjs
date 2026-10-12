// MIT. Native invoice and payment-request operations on the existing accounting owner.
const PREFIX = 'merchant_accounting_receivables_';
const text = (max, min = 0) => ({type: 'string', minLength: min, maxLength: max});
const uuid = {type: 'string', pattern: '^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$'};
const alias = {type: 'string', pattern: '^[a-z0-9][a-z0-9_-]{0,63}$'};
const hash = {type: 'string', pattern: '^[a-f0-9]{64}$'};
const date = {type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'};
const revision = {type: 'integer', minimum: 1};
const actor = text(1000, 1);
const requestId = {type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$'};
const money = {type: 'string', pattern: '^(0|[1-9][0-9]{0,38})(?:[.][0-9]{1,6})?$'};
const quantity = {type: 'string', pattern: '^(0|[1-9][0-9]{0,17})(?:[.][0-9]{1,6})?$'};
const lineId = {type: 'string', minLength: 1, maxLength: 80, pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]*$'};
const nullableId = {anyOf: [uuid, {type: 'null'}]};
const account = {type: 'string', pattern: '^G[A-Z2-7]{55}$'};
const base = {workspace: alias};
const context = {...base, actor, requestId, revision};
const page = {offset: {type: 'integer', minimum: 0}, limit: {type: 'integer', minimum: 1, maximum: 200}};
const nativePage = {...page, limit: {type: 'integer', minimum: 1, maximum: 500}};
const readOnly = {readOnly: true, idempotent: true};
const object = (properties, required = [], additionalProperties = false) =>
  ({type: 'object', properties, required, additionalProperties});
const currency = object({code: {type: 'string', pattern: '^[A-Z]{3}$'},
  scale: {type: 'integer', minimum: 0, maximum: 6}}, ['code', 'scale']);
const issuer = {name: text(300), address: text(2000), email: text(300), taxReference: text(300),
  paymentInstructions: text(4000), invoicePrefix: {type: 'string', minLength: 1, maxLength: 20, pattern: '^[A-Z0-9][A-Z0-9-]*$'},
  creditPrefix: {type: 'string', minLength: 1, maxLength: 20, pattern: '^[A-Z0-9][A-Z0-9-]*$'}};
const draftLine = object({id: lineId, description: text(3000, 1), quantity, unitAmount: money,
  discountAmount: money, taxAmount: money}, ['description', 'quantity', 'unitAmount']);
const draft = {customerId: uuid, currency, issueDate: date, dueDate: date,
  lines: {type: 'array', minItems: 1, maxItems: 250, items: draftLine},
  purchaseOrder: text(300), note: text(6000), replacesId: nullableId, sourceReference: text(1000)};
const asset = {anyOf: [
  object({kind: {type: 'string', enum: ['native']}, code: {type: 'string', enum: ['XLM']}, issuer: {type: 'null'}}, ['kind']),
  object({kind: {type: 'string', enum: ['credit']}, code: {type: 'string', pattern: '^[A-Za-z0-9]{1,12}$'}, issuer: account},
    ['kind', 'code', 'issuer'])
]};
const memo = {anyOf: [
  object({type: {type: 'string', enum: ['MEMO_TEXT']}, value: text(28)}, ['type', 'value']),
  object({type: {type: 'string', enum: ['MEMO_ID']}, value: {type: 'string', pattern: '^(0|[1-9][0-9]{0,19})$'}}, ['type', 'value']),
  object({type: {type: 'string', enum: ['MEMO_HASH', 'MEMO_RETURN']},
    value: {type: 'string', pattern: '^[A-Za-z0-9+/]{43}=$'}}, ['type', 'value'])
]};
const network = {type: 'string', enum: ['stellar:pubnet', 'stellar:testnet']};
const expiresAt = {anyOf: [
  {type: 'string', pattern: '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:[.][0-9]{1,3})?Z$'},
  {type: 'null'}
]};
const paymentTerms = {id: uuid, invoiceAmount: money, network, destination: account, asset,
  stellarAmount: {type: 'string', pattern: '^(0|[1-9][0-9]{0,18})(?:[.][0-9]{1,7})?$'},
  memo, msg: text(300), expiresAt, valuationNote: text(4000)};
const proposal = object({
  schema: {type: 'string', enum: ['stellar-forge.invoice-payment-proposal.v1']},
  ...paymentTerms,
  invoice: object({id: uuid, number: text(100, 1), sha256: hash, version: revision, currency,
    total: money, amountDue: money, asOf: date, customer: {type: 'object', properties: {}, additionalProperties: true}, issuer: {type: 'object', properties: {}, additionalProperties: true}},
    ['id', 'number', 'sha256', 'version', 'currency', 'total', 'amountDue', 'asOf', 'customer', 'issuer'], true),
  networkPassphrase: text(200, 1), amountAtomic: {type: 'string', pattern: '^[1-9][0-9]*$'}, uri: text(10000, 1),
}, ['schema', 'id', 'invoice', 'invoiceAmount', 'network', 'networkPassphrase', 'destination', 'asset',
  'stellarAmount', 'amountAtomic', 'memo', 'msg', 'expiresAt', 'valuationNote', 'uri'], true);
const read = (suffix, description, properties = {}, required = []) =>
  [PREFIX + suffix, description, {...base, ...properties}, ['workspace', ...required], readOnly];
const mutate = (suffix, description, properties = {}, required = []) =>
  [PREFIX + suffix, description, {...context, ...properties}, ['workspace', 'actor', 'requestId', 'revision', ...required], {idempotent: true}];

export const receivablesFileNames = Object.freeze([
  'invoice.json', 'invoice.csv', 'invoice.html', 'credit.json', 'credit.csv', 'credit.html',
  'manifest.json', 'status.json', 'quote.json', 'response.json', 'source.json', 'review.json',
  'preview.json', 'preview.csv', 'preview.html', 'payment-request.json', 'payment-request.html',
  'payment-request.uri', 'receiving.json', 'proof.json', 'account.json', 'invoices.csv', 'account.html', 'account.tar',
]);
export const receivablesFileSelectors = Object.freeze([
  'documentId', 'invoiceId', 'paymentRequestId', 'returnId', 'customerId', 'asOf',
]);
export const receivablesDefinitions = [
  read('status', 'Read original invoice, receipt, credit, allocation, aging or operation-journal rows. Summary returns issuer, scoped counts and the current accounting revision.',
    {view: {type: 'string', enum: ['summary', 'invoices', 'receipts', 'credits', 'allocations', 'aging', 'history']},
      customerId: uuid, status: text(100), search: text(300), asOf: date, ...page}),
  mutate('settings', 'Save the original merchant invoice and credit-note document settings through the existing receivables operation journal.', issuer),
  mutate('draft_save', 'Create or edit an original invoice draft. Editing selects invoiceId and its current expectedVersion; currency, lines and customer remain native invoice inputs.',
    {...draft, invoiceId: uuid, expectedVersion: revision},
    ['customerId', 'currency', 'issueDate', 'dueDate', 'lines']),
  mutate('quote_import', 'Import an original service quotation into an editable invoice. For each file choose a configured receivablesInputs source alias or original inline UTF-8 content. Recurring scope carries its exact period count and label.',
    {quoteSource: alias, quoteContent: text(2000000, 1), responseSource: alias, responseContent: text(2000000),
      customerId: uuid, issueDate: date, dueDate: date, currencyScale: {type: 'integer', minimum: 0, maximum: 6},
      scope: {type: 'string', enum: ['IMPLEMENTATION', 'RECURRING']},
      periodCount: {type: 'integer', minimum: 1, maximum: 9007199254740991}, periodLabel: text(300)},
    ['customerId', 'issueDate', 'dueDate', 'scope']),
  read('invoice_preview', 'Review the original draft document, native preview SHA256 and version. Summary includes complete preview file identities for the existing file reader; lines pages the original invoice lines.',
    {invoiceId: uuid, view: {type: 'string', enum: ['summary', 'lines']}, ...page}, ['invoiceId']),
  mutate('invoice_issue', 'Issue the exact reviewed original invoice using its native previewSha256 and expectedVersion. Retain the original requestId to recover a lost response.',
    {invoiceId: uuid, previewSha256: hash, expectedVersion: revision}, ['invoiceId', 'previewSha256', 'expectedVersion']),
  read('invoice_detail', 'Open an original invoice, retained quotation binding and immutable document files, or page its lines, credits, allocations, receipts and history.',
    {invoiceId: uuid, asOf: date, view: {type: 'string', enum: ['summary', 'lines', 'credits', 'allocations', 'receipts', 'history']},
      ...page}, ['invoiceId']),
  mutate('invoice_void', 'Record the original invoice void date and reason while retaining its issued files, payment and correction history.',
    {invoiceId: uuid, voidDate: date, reason: text(3000, 1)}, ['invoiceId', 'voidDate', 'reason']),
  mutate('credit', 'Issue an original credit note against selected issued invoice lines. Native cumulative net and tax checks preserve the original invoice and all prior credits.',
    {invoiceId: uuid, creditDate: date, reason: text(3000, 1),
      lines: {type: 'array', minItems: 1, maxItems: 250,
        items: object({invoiceLineId: lineId, netAmount: money, taxAmount: money}, ['invoiceLineId', 'netAmount'])}},
    ['invoiceId', 'creditDate', 'reason', 'lines']),
  mutate('receipt_record', 'Record an existing customer payment in its invoice currency with the original date, method and reference; allocation remains an explicit receivables operation.',
    {customerId: uuid, currency, amount: money, receivedDate: date, method: text(100, 1),
      reference: text(300, 1), note: text(4000)}, ['customerId', 'currency', 'amount', 'receivedDate', 'method', 'reference']),
  mutate('receipt_void', 'Record the original receipt void date and reason after resolving its active allocations through the native accounting workflow.',
    {receiptId: uuid, voidDate: date, reason: text(3000, 1)}, ['receiptId', 'voidDate', 'reason']),
  read('settlement_ledger', 'Page the original completed reconciliation ledger, with optional existing customer bindings, native transfer eligibility and original imported-receipt identities.',
    {runId: uuid, customerId: uuid, ...nativePage}, ['runId']),
  mutate('settlement_import', 'Import one unique original verified public-network settlement for its assigned customer. Preserve the exact run/event identity, selected invoice-currency value, date and valuation basis.',
    {customerId: uuid, runId: uuid, eventId: hash, currency, amount: money, receivedDate: date,
      valuationNote: text(4000, 1), reference: text(300), note: text(4000)},
    ['customerId', 'runId', 'eventId', 'currency', 'amount', 'receivedDate', 'valuationNote']),
  mutate('allocate', 'Apply an original customer receipt to an issued invoice. Native customer, currency, precision and dated-balance conservation remain authoritative.',
    {invoiceId: uuid, receiptId: uuid, amount: money, allocatedDate: date},
    ['invoiceId', 'receiptId', 'amount', 'allocatedDate']),
  mutate('release', 'Release one original allocation on the selected date with its retained correction reason. The original receipt remains in the customer account.',
    {allocationId: uuid, releasedDate: date, reason: text(3000, 1)}, ['allocationId', 'releasedDate', 'reason']),
  read('customer_export', 'Prepare the original dated customer account inventory and exact source/file identities. Read account.tar or any original manifest member through merchant_accounting_file.',
    {customerId: uuid, asOf: date}, ['customerId']),
  read('payment_preview', 'Review an invoice-bound Stellar SEP7 wallet request using the current issued invoice balance. Returns the exact proposal, reviewSha256 and revision; keeps invoice value and received Stellar amount distinct.',
    {invoiceId: uuid, ...paymentTerms}, ['invoiceId', 'network', 'destination', 'asset', 'stellarAmount']),
  mutate('payment_create', 'Issue the exact original proposal from payment_preview. The original invoice snapshot, selected amount, network, asset, destination, memo and reviewSha256 remain bound together.',
    {invoiceId: uuid, proposal, reviewSha256: hash}, ['invoiceId', 'proposal', 'reviewSha256']),
  read('payment_list', 'Page original invoice payment requests, optionally for one invoice or customer, with current or dated receipt/allocation amounts and original request status.',
    {invoiceId: uuid, customerId: uuid, status: text(100), asOf: date, ...nativePage}),
  read('payment_detail', 'Open one original payment request and its exact reviewed proposal, or page returns, observations, receipts, allocations and history. An observations view selects returnId and supplies its complete native proof file.',
    {paymentRequestId: uuid, returnId: uuid, asOf: date,
      view: {type: 'string', enum: ['summary', 'returns', 'observations', 'receipts', 'allocations', 'history']}, ...page},
    ['paymentRequestId']),
  mutate('payment_cancel', 'Withdraw one original collection request with its reason. Retain the request, transaction observations, customer receipts and invoice allocation history.',
    {paymentRequestId: uuid, reason: text(3000, 1)}, ['paymentRequestId', 'reason']),
  mutate('payment_return', 'Record the original wallet transaction hash against an issued request. Optional payer constrains the original operation sender; otherwise the native verifier derives that account.',
    {paymentRequestId: uuid, transaction: hash, payer: {anyOf: [account, {type: 'null'}]}, note: text(4000)},
    ['paymentRequestId', 'transaction']),
  mutate('payment_receive', 'Verify the saved returned transaction through the original Stellar network. A matching public transfer creates the original receipt and optional dated allocation; test-network and incomplete observations retain their original proof and state.',
    {paymentRequestId: uuid, returnId: uuid, allocate: {type: 'boolean'},
      allocationAmount: money, allocatedDate: date, note: text(4000)}, ['paymentRequestId', 'returnId']),
  read('request_lookup', 'Recover the exact original receivables operation by requestId after an uncertain response. Returns found, the retained operation and current original invoice/payment/receipt result identities.',
    {requestId, asOf: date}, ['requestId']),
];

export {PREFIX, base, context, page, nativePage, readOnly, text, uuid, alias, hash, date,
  revision, actor, requestId, money, currency, draft, paymentTerms, proposal};
