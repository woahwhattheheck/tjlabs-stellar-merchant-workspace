#!/usr/bin/env node
// MIT. One complete private commercial lifecycle through the original merchant MCP host and transport.
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {MerchantAccounting, normalizeAccountingConfig} from './stellar-forge/mcp-merchant-operator/accounting.mjs';
import {accountingTools} from './stellar-forge/mcp-merchant-operator/catalog/accounting.mjs';
import {withMerchantOperationErrors} from './stellar-forge/mcp-merchant-operator/operation-error.mjs';
import {withServiceAgreementToolErrors} from './stellar-forge/mcp-merchant-operator/service-agreements-errors.mjs';
import {createMcpToolHandler} from './stellar-forge/mcp-paid-agent/http-tools.mjs';
import {connectAccountingReceivablesClient} from './stellar-forge/mcp-merchant-operator/accounting-receivables-client.mjs';
import {prepareAccountingReceivablesOperation, runAccountingReceivablesOperation, downloadAccountingReceivablesFile}
  from './stellar-forge/mcp-merchant-operator/accounting-receivables-cli.mjs';
import {newCommissioning} from './stellar/scf-starforge-20261009/sf74-merchant-support-console/commissioning.mjs';
import {commercialContext, emptyCommercialDraft, reviewCommercialQuote, sealCommercialQuote, makeCommercialDocument}
  from './stellar/scf-starforge-20261009/sf74-merchant-support-console/commercial-quote.mjs';
import {canonical as commercialCanonical} from './stellar/scf-starforge-20261009/sf74-merchant-support-console/commercial-pricing.mjs';
import {json, sha} from './stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/core.mjs';
import {NETWORKS} from './stellar/scf-starforge-20261009/sf86-rpc-transfer-reconcile/terms.mjs';

function sourceStrKey(version, fill) {
  const bytes = Buffer.alloc(35, fill); bytes[0] = version;
  let crc = 0;
  for (const byte of bytes.subarray(0, 33)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = ((crc << 1) ^ (crc & 0x8000 ? 0x1021 : 0)) & 65535;
  }
  bytes[33] = crc & 255; bytes[34] = crc >> 8;
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let result = '', bits = 0, acc = 0;
  for (const byte of bytes) {
    acc = (acc << 8) | byte; bits += 8;
    while (bits >= 5) { bits -= 5; result += alphabet[(acc >>> bits) & 31]; }
    acc &= (1 << bits) - 1;
  }
  return result;
}


async function originalQuoteInputs(customer, actor) {
  // Exercise input goes through the original producer model and document factory.
  const sourceWorkspace = {commissioning: newCommissioning()}, caseId = randomUUID();
  const context = await commercialContext(sourceWorkspace, {caseId, workspaceId: 'local-receivables-quotation',
    revision: sha(json(sourceWorkspace))});
  const draft = emptyCommercialDraft();
  draft.title = 'Native receivables quotation';
  draft.customer = {name: customer.name, contact: customer.email ?? ''};
  draft.implementation.lines = [{id: 'implementation-hours', taskId: null, title: 'Implementation hours',
    hours: '1.25', rateUsd: '80'}];
  draft.service.lines = [{id: 'recurring-service', commitmentId: null, title: 'Monthly service',
    quantity: '1', unitUsd: '25.123456'}];
  draft.terms = {scope: 'Local software exercise of quote-based invoicing',
    deliverables: 'Retained invoice drafts and complete original quotation files',
    exclusions: '', payment: 'The selected once-only fee or explicit monthly periods',
    acceptance: 'Local operator receiving inside this software exercise'};
  const review = reviewCommercialQuote(context, draft), quoteId = randomUUID(), createdAt = '2026-01-01T00:00:00.000Z';
  const quote = sealCommercialQuote({id: quoteId, createdAt, draft, review});
  const publishArgs = {id: caseId, expectedRevision: context.revision, requestId: quoteId,
    actor, draft, reviewSha256: review.reviewSha256, parentId: null};
  const originalQuote = makeCommercialDocument({kind: 'QUOTE', requestId: quoteId, caseId, createdAt,
    request: {action: 'publish', actor,
      sha256: sha(commercialCanonical({action: 'publish', args: publishArgs}))}, payload: quote});
  const responseId = randomUUID(), observedAt = '2026-01-01T00:01:00.000Z';
  const response = {quoteId, quoteSha256: quote.sha256, status: 'ACCEPTED', observedAt,
    source: 'urn:stellar-forge:local-receivables-exercise:operator-receiving',
    note: 'Controlled local software-exercise receiving'};
  const receiveArgs = {id: caseId, expectedRevision: context.revision, requestId: responseId, actor, ...response};
  const originalResponse = makeCommercialDocument({kind: 'RESPONSE', requestId: responseId, caseId,
    createdAt: observedAt, request: {action: 'receive', actor,
      sha256: sha(commercialCanonical({action: 'receive', args: receiveArgs}))}, payload: response});
  return {quote, quoteContent: json(originalQuote), responseContent: json(originalResponse)};
}


const sourceRoot = dirname(fileURLToPath(import.meta.url));
const temporary = await mkdtemp(join(process.env.SCF_MCP_RECEIVABLES_TMP || tmpdir(), 'mcp-receivables-'));
const prefix = 'merchant_accounting_receivables_', alias = 'billing', actor = 'Private native MCP receiving';
const tokenEnv = 'SCF_MCP_RECEIVING_TOKEN', environment = {[tokenEnv]: randomUUID() + randomUUID()};
const originalFetch = globalThis.fetch, workflows = [], delivered = [], calls = new Map();
let host, server, client, reopened, firstReply = true, failRelease = false, rpcCalls = 0;
let activeNetwork = 'stellar:pubnet';
const fixtureHash = sha('private-native-mcp-transaction-not-found');
const recoveryBillingId = randomUUID();
const selectedFiles = [];
try {
  const directory = join(temporary, 'accounting'), outboxDir = join(temporary, 'outbox'),
    proofDir = join(temporary, 'proofs'), inputs = join(temporary, 'inputs'), termsFile = join(temporary, 'terms.json'),
    quotePath = join(inputs, 'quote.json'), responsePath = join(inputs, 'response.json'),
    delivery = join(temporary, 'delivery');
  for (const path of [outboxDir, proofDir, inputs, delivery]) await mkdir(path, {mode: 0o700});
  const destination = sourceStrKey(48, 2), customerName = 'Native merchant receivables customer';
  const producer = await originalQuoteInputs({name: customerName}, actor);
  await writeFile(quotePath, producer.quoteContent, {mode: 0o600});
  await writeFile(responsePath, producer.responseContent, {mode: 0o600});
  await writeFile(termsFile, json({schema: 'stellar-forge.merchant-accounting-terms.v1', routes: [{
    routeId: 'invoice-mcp-check', method: 'GET', network: 'stellar:testnet', asset: sourceStrKey(16, 1),
    payTo: destination, amountAtomic: '1000000', unitPriceUsd: '1', unitCostUsd: null,
    priceBasis: 'Private original merchant receiving program'
  }]}), {mode: 0o600});
  const accounting = normalizeAccountingConfig({workspaces: {[alias]: {directory, outboxDir, proofDir, termsFile,
    receivablesInputs: {quote: quotePath, response: responsePath}}}}, temporary);
  host = new MerchantAccounting({accounting});
  const tools = accountingTools((name, description, properties, required, annotations) =>
    ({name, description, inputSchema: {type: 'object', properties, required, additionalProperties: false}, annotations}));
  const originalErrorView = error => error?.code === 'PRIVATE_RECOVERY_PROJECTION'
    ? {details: {originalProjection: 'retained'}} : {};
  const handler = createMcpToolHandler({tools, call: async (name, args) => {
    calls.set(name, (calls.get(name) ?? 0) + 1);
    if (name === prefix + 'request_lookup' && args.requestId === 'private-wire-recovery') {
      // A deliberate transport-only error carries the real host's public recovery shape.
      throw Object.assign(new Error('Private receiving projection of original recovery fields'), {
        code: 'PRIVATE_RECOVERY_PROJECTION', status: 409, outcomeUnknown: true, reopenRequired: true,
        commitUncertainty: {at: '2026-01-01T00:00:00.000Z', action: 'receivables_draft_saved',
          revision: 7, causeCode: 'PRIVATE_RECEIVING_ERROR'},
        details: {agreementBillingPrepared: true, billingId: recoveryBillingId,
          requestId: 'private-wire-recovery'}, internalOnly: quotePath
      });
    }
    if (name === 'merchant_accounting_file_release' && failRelease) {
      failRelease = false;
      throw Object.assign(new Error('Private transient release failure'), {code: 'PRIVATE_RELEASE_RETRY'});
    }
    const result = await host.call(name, args);
    if (name === prefix + 'quote_import' && firstReply) {
      firstReply = false;
      // The original import has committed; only this controlled first reply is unavailable.
      throw Object.assign(new Error('Private interruption after the original quote import committed'),
        {code: 'PRIVATE_REPLY_INTERRUPTED'});
    }
    return result;
  }}, {bearerToken: environment[tokenEnv], serverName: 'merchant-receivables-check',
    instructions: 'Private native invoice collection receiving.', maxRequestBytes: 4_000_000,
    toolErrorView: withServiceAgreementToolErrors(withMerchantOperationErrors(originalErrorView))});
  server = createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject); server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve(); });
  });
  const url = 'http://127.0.0.1:' + server.address().port + '/mcp';
  const connection = {url, workspace: alias, tokenEnv, environment};
  // Loopback calls retain the original HTTP transport. Only canonical Stellar RPC calls use the fixture.
  globalThis.fetch = async (input, options) => {
    const endpoint = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (endpoint.origin === new URL(url).origin) return originalFetch(input, options);
    const selected = NETWORKS[activeNetwork];
    assert.ok(selected.rpcEndpoints.some(value => new URL(value).href === endpoint.href),
      'The default verifier selected an original canonical Stellar RPC endpoint.');
    const body = JSON.parse(options.body);
    assert.ok(body.method === 'getNetwork' || body.method === 'getTransaction');
    rpcCalls++;
    if (body.method === 'getTransaction') assert.equal(body.params.hash, fixtureHash);
    const result = body.method === 'getNetwork' ? {passphrase: selected.passphrase, protocolVersion: 23} :
      {status: 'NOT_FOUND', latestLedger: 123456, oldestLedger: 123400};
    return Response.json({jsonrpc: '2.0', id: body.id, result});
  };
  client = await connectAccountingReceivablesClient(connection);
  await client.sources(); await client.open();
  const initial = await client.status();
  const customer = (await host.call('merchant_accounting_customer_save', {workspace: alias,
    revision: initial.revision, actor, reference: 'NATIVE-MCP', name: customerName})).customer;
  async function op(value) {
    return {revision: (await client.status()).revision, actor, requestId: randomUUID(), ...value};
  }
  await client.saveSettings(await op({name: 'Native invoice collection merchant', invoicePrefix: 'MCP', creditPrefix: 'CR'}));
  workflows.push('Original configured sources, authenticated MCP connection, accounting ownership and current customer identity');

  const date = new Date().toISOString().slice(0, 10), currency = {code: 'USD', scale: 2};
  const quoteArgs = {quoteSource: 'quote', actor, customerId: customer.id, scope: 'IMPLEMENTATION',
    responseSource: 'response', issueDate: date, currencyScale: 2, dueDate: date,
    requestId: randomUUID(), revision: (await client.status()).revision};
  const quoteOperation = join(temporary, 'quote-operation');
  await prepareAccountingReceivablesOperation({directory: quoteOperation, url, workspace: alias, tokenEnv,
    kind: 'quote_import', arguments: quoteArgs});
  const imported = await runAccountingReceivablesOperation({directory: quoteOperation, execute: true, client});
  assert.equal(imported.found, true); assert.equal(imported.submitted, true); assert.equal(imported.acknowledged, false);
  assert.equal(imported.invoice.total, '100.00');
  const invoiceId = imported.invoice.id;
  await writeFile(quotePath, json({changedConfiguredSource: true}), {mode: 0o600});
  await writeFile(responsePath, json({changedConfiguredSource: true}), {mode: 0o600});
  const reconciled = await runAccountingReceivablesOperation({directory: quoteOperation, execute: false, client});
  assert.equal(reconciled.found, true); assert.equal(reconciled.invoice.id, invoiceId);
  assert.equal(calls.get(prefix + 'quote_import'), 1);
  const sourceQuote = await client.fileBytes({kind: 'receivables-quote', invoiceId, file: 'quote.json'},
    {expectedSha256: sha(producer.quoteContent), chunkBytes: 257});
  const sourceResponse = await client.fileBytes({kind: 'receivables-quote', invoiceId, file: 'response.json'},
    {expectedSha256: sha(producer.responseContent), chunkBytes: 257});
  assert.equal(Buffer.from(sourceQuote.bytes).toString('utf8'), producer.quoteContent);
  assert.equal(Buffer.from(sourceResponse.bytes).toString('utf8'), producer.responseContent);
  workflows.push('Original sealed SF74 quote/response, configured alias import, lost-reply recovery and archived-byte reconciliation after both aliases change');

  const initialPreview = await client.previewInvoice({invoiceId}), originalDraft = initialPreview.document;
  const businessNote = 'Customer source reference stays exact: ' + quotePath;
  await client.saveDraft(await op({invoiceId, expectedVersion: initialPreview.expectedVersion,
    customerId: customer.id, currency, issueDate: date, dueDate: date, note: businessNote,
    sourceReference: originalDraft.sourceReference, purchaseOrder: originalDraft.purchaseOrder,
    lines: originalDraft.lines.map(({id, description, quantity, unitAmount, discountAmount, taxAmount}) =>
      ({id, description, quantity, unitAmount, discountAmount, taxAmount}))}));
  const preview = await client.previewInvoice({invoiceId});
  assert.equal(preview.document.note, businessNote);
  const issueOperation = join(temporary, 'issue-operation');
  await prepareAccountingReceivablesOperation({directory: issueOperation, url, workspace: alias, tokenEnv,
    kind: 'invoice_issue', preview, actor, requestId: randomUUID()});
  const issued = await runAccountingReceivablesOperation({directory: issueOperation, execute: true, client});
  assert.equal(issued.invoice.status, 'ISSUED'); assert.equal(issued.invoice.amountDue, '100.00');
  const invoiceDocument = {kind: 'receivables-document', documentId: invoiceId, file: 'invoice.json'};
  const originalInvoice = await client.fileBytes(invoiceDocument, {chunkBytes: 257});
  assert.equal(JSON.parse(Buffer.from(originalInvoice.bytes).toString()).note, businessNote);
  const originalInvoiceSha = originalInvoice.file.sha256;
  workflows.push('Editable native draft, complete SHA-bound preview, original invoice issuance and unchanged reviewed business text over HTTP');

  const reviewed = await client.previewPaymentRequest({invoiceId, network: activeNetwork, destination,
    asset: {kind: 'native'}, stellarAmount: '10', invoiceAmount: '100.00',
    valuationNote: 'Explicit private collection terms: 10 XLM for the reviewed USD 100.00 invoice amount.'});
  const paymentOperation = join(temporary, 'payment-operation');
  await prepareAccountingReceivablesOperation({directory: paymentOperation, url, workspace: alias, tokenEnv,
    kind: 'payment_create', preview: reviewed, actor, requestId: randomUUID()});
  const created = await runAccountingReceivablesOperation({directory: paymentOperation, execute: true, client});
  const paymentRequestId = created.paymentRequest.id;
  assert.match(created.paymentRequest.uri, /^web\+stellar:pay\?/);
  const paymentDocument = {kind: 'receivables-payment', paymentRequestId, file: 'payment-request.json'};
  const originalPayment = await client.fileBytes(paymentDocument);
  const returned = await client.reportPaymentReturn(await op({paymentRequestId, transaction: fixtureHash}));
  const returnId = returned.paymentReturn.id;
  const observed = await client.receivePaymentRequest(await op({paymentRequestId, returnId}));
  assert.equal(observed.paymentRequest.status, 'NOT_FOUND');
  assert.equal((await client.status({view: 'receipts'})).total, 0);
  assert.equal((await client.invoice({invoiceId})).invoice.amountDue, '100.00');
  const observations = await client.paymentRequest({paymentRequestId, returnId, view: 'observations'});
  assert.equal(observations.items.at(-1).status, 'NOT_FOUND');
  const proofSelection = {kind: 'receivables-payment', paymentRequestId, returnId, file: 'proof.json'};
  const proof = await client.fileBytes(proofSelection, {chunkBytes: 257});
  const proofValue = JSON.parse(Buffer.from(proof.bytes).toString());
  assert.equal(proofValue.returned.observations.at(-1).verification.proof.transactionResponse.status, 'NOT_FOUND');
  const cancelled = await client.cancelPaymentRequest(await op({paymentRequestId,
    reason: 'Customer selected a recorded bank transfer for this private receiving workflow.'}));
  assert.equal(cancelled.paymentRequest.status, 'CANCELLED');
  const cancelledRows = await client.paymentRequests({invoiceId, status: 'CANCELLED', limit: 1});
  assert.equal(cancelledRows.total, 1); assert.equal(cancelledRows.items[0].id, paymentRequestId);
  workflows.push('Reviewed SEP-7 handoff, optional payer return, original RPC NOT_FOUND observation, retained proof and explicit cancellation');

  const preliminary = (await client.recordReceipt(await op({customerId: customer.id, currency, amount: '70.00',
    receivedDate: date, method: 'Bank transfer', reference: 'PRIVATE-BANK-PRELIMINARY',
    note: 'Preliminary bank posting entered during this private receiving workflow.'}))).receipt;
  const allocation = await client.allocate(await op({invoiceId, receiptId: preliminary.id, amount: '70.00', allocatedDate: date}));
  assert.equal(allocation.invoice.amountDue, '30.00');
  const credit = await client.issueCredit(await op({invoiceId, creditDate: date,
    reason: 'Agreed scope reduction recorded by the merchant operator in this private workflow.',
    lines: [{invoiceLineId: preview.document.lines[0].id, netAmount: '25.00', taxAmount: '0.00'}]}));
  assert.equal(credit.invoice.amountDue, '5.00');
  await client.releaseAllocation(await op({allocationId: allocation.allocation.id, releasedDate: date,
    reason: 'Replace the preliminary bank posting with its corrected statement amount.'}));
  await client.voidReceipt(await op({receiptId: preliminary.id, voidDate: date,
    reason: 'The corrected bank statement identifies USD 75.00 in place of the preliminary USD 70.00 posting.'}));
  const corrected = (await client.recordReceipt(await op({customerId: customer.id, currency, amount: '75.00',
    receivedDate: date, method: 'Bank transfer', reference: 'PRIVATE-BANK-CORRECTED',
    note: 'Corrected statement entry for the original invoice.'}))).receipt;
  const finalAllocation = await client.allocate(await op({invoiceId, receiptId: corrected.id, amount: '75.00', allocatedDate: date}));
  assert.equal(finalAllocation.invoice.amountDue, '0.00'); assert.equal(finalAllocation.invoice.paymentStatus, 'PAID');
  assert.equal(finalAllocation.invoice.credited, '25.00'); assert.equal(finalAllocation.invoice.paid, '75.00');
  const inventory = await client.listAll('status', {view: 'receipts', customerId: customer.id, asOf: date});
  assert.equal(inventory.total, 2);
  assert.equal(inventory.items.filter(row => row.status === 'VOID').length, 1);
  workflows.push('Original USD 70.00 preliminary receipt, USD 25.00 scope credit, allocation release, corrected USD 75.00 receipt and fully paid invoice');

  const account = await client.customerExport({customerId: customer.id, asOf: date});
  assert.equal(account.counts.invoices, 1); assert.equal(account.counts.credits, 1);
  selectedFiles.push(
    {selection: invoiceDocument, sha256: originalInvoiceSha, output: 'invoice.json'},
    {selection: {kind: 'receivables-document', documentId: credit.credit.id, file: 'credit.json'},
      sha256: credit.credit.files['credit.json'].sha256, output: 'credit.json'},
    {selection: paymentDocument, sha256: originalPayment.file.sha256, output: 'payment-request.json'},
    {selection: {kind: 'receivables-payment', paymentRequestId, file: 'payment-request.uri'}, output: 'payment-request.uri'},
    {selection: proofSelection, sha256: proof.file.sha256, output: 'proof.json'},
    {selection: {kind: 'receivables-payment', paymentRequestId, file: 'receiving.json'}, output: 'receiving.json'},
    {selection: {kind: 'receivables-quote', invoiceId, file: 'quote.json'}, sha256: sha(producer.quoteContent), output: 'quote.json'},
    {selection: {kind: 'receivables-quote', invoiceId, file: 'response.json'}, sha256: sha(producer.responseContent), output: 'response.json'},
    {selection: account.packet, output: 'account.tar'}
  );
  for (const row of selectedFiles) {
    const result = await downloadAccountingReceivablesFile({client, selection: row.selection,
      expectedSha256: row.sha256, chunkBytes: 257, output: join(delivery, row.output)});
    assert.equal(sha(await readFile(result.output)), result.file.sha256);
    delivered.push({name: row.output, bytes: result.file.bytes, sha256: result.file.sha256});
  }
  const completeAccount = await client.fileBytes({kind: 'receivables-customer', customerId: customer.id,
    asOf: date, file: 'account.json'});
  const accountValue = JSON.parse(Buffer.from(completeAccount.bytes).toString());
  assert.equal(accountValue.invoices[0].amountDue, '0.00');
  assert.equal((await client.fileBytes(invoiceDocument, {expectedSha256: originalInvoiceSha})).file.sha256, originalInvoiceSha);
  workflows.push('Complete original invoice, credit, quote/response, wallet instructions, hydrated receiving proof and native customer account.tar through retained SHA-pinned chunks');

  let recoveryError;
  try { await client.lookupOperation({requestId: 'private-wire-recovery'}); }
  catch (error) { recoveryError = error; }
  assert.equal(recoveryError?.outcomeUnknown, true); assert.equal(recoveryError?.reopenRequired, true);
  assert.equal(recoveryError?.status, 409); assert.equal(recoveryError?.commitUncertainty?.revision, 7);
  assert.equal(recoveryError?.details?.commitUncertainty?.revision, 7);
  assert.equal(recoveryError?.details?.agreementBillingPrepared, true);
  assert.equal(recoveryError?.details?.billingId, recoveryBillingId);
  assert.equal(recoveryError?.details?.requestId, 'private-wire-recovery');
  assert.equal(recoveryError?.details?.originalProjection, 'retained');
  assert.equal(recoveryError?.internalOnly, undefined);
  const partial = client.fileChunks(invoiceDocument, {expectedSha256: originalInvoiceSha, chunkBytes: 17});
  const first = await partial.next(); assert.equal(first.done, false); assert.equal(first.value.complete, false);
  failRelease = true;
  await assert.rejects(() => client.disconnect(), {code: 'PRIVATE_RELEASE_RETRY'});
  await client.disconnect(); await partial.return(); client = null;
  workflows.push('Original application, invoice and service-agreement recovery fields survive the composed HTTP projector; an interrupted download finishes its same read drain after a transient release failure');

  reopened = await connectAccountingReceivablesClient(connection); await reopened.open();
  assert.equal((await reopened.invoice({invoiceId})).invoice.amountDue, '0.00');
  await reopened.closeWorkspace(); await reopened.disconnect(); reopened = null;
  reopened = await connectAccountingReceivablesClient(connection); await reopened.open();
  const after = await reopened.invoice({invoiceId});
  assert.equal(after.invoice.paymentStatus, 'PAID'); assert.equal(after.invoice.paid, '75.00');
  assert.equal((await reopened.paymentRequest({paymentRequestId})).paymentRequest.status, 'CANCELLED');
  assert.equal((await reopened.fileBytes(invoiceDocument, {expectedSha256: originalInvoiceSha})).file.sha256, originalInvoiceSha);
  assert.equal((await reopened.fileBytes(paymentDocument, {expectedSha256: originalPayment.file.sha256})).file.sha256,
    originalPayment.file.sha256);
  const recoveredQuote = await runAccountingReceivablesOperation({directory: quoteOperation, execute: false, client: reopened});
  assert.equal(recoveredQuote.found, true); assert.equal(recoveredQuote.invoice.id, invoiceId);
  assert.equal(calls.get(prefix + 'quote_import'), 1);
  const postReopenProof = await reopened.fileBytes(proofSelection, {expectedSha256: proof.file.sha256});
  assert.equal(postReopenProof.file.sha256, proof.file.sha256);
  await reopened.closeWorkspace(); await reopened.disconnect(); reopened = null;
  workflows.push('Original owner closed and reopened with paid invoice, cancelled wallet request, native proof, sealed documents and saved quote request intact');

  const result = {result: 'PASS', runtime: process.version, operation: 'SCF-MCP-RECEIVABLES-COLLECTION-2A51-20261012',
    transport: 'Original authenticated MCP HTTP handler and merchant accounting host',
    quoteProducer: 'Original SF74 commercial context, quote review/seal and response document factory',
    rpcObservation: 'Controlled NOT_FOUND through the original canonical RPC transport',
    currency: 'USD', invoiceTotal: '100.00', credited: '25.00', paid: '75.00', amountDue: '0.00',
    receiptRecords: 2, currentReceipts: 1, nativeQuoteImports: calls.get(prefix + 'quote_import'),
    rpcFixtureCalls: rpcCalls, workflows, files: delivered, toolCalls: Object.fromEntries(calls)};
  await writeFile(join(sourceRoot, 'MCP_RECEIVABLES_CHECK_RESULT.json'), json(result), {mode: 0o600});
  process.stdout.write(json(result));
} finally {
  if (client) await client.disconnect().catch(() => {});
  if (reopened) await reopened.disconnect().catch(() => {});
  globalThis.fetch = originalFetch;
  if (server) {
    server.closeAllConnections?.();
    await new Promise(resolve => server.close(() => resolve()));
  }
  if (host) await host.close().catch(() => {});
  await rm(temporary, {recursive: true, force: true});
}
