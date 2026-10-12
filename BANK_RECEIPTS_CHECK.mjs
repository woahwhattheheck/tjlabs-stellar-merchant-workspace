#!/usr/bin/env node
// MIT. One complete private customer cash workflow using the original AccountingWorkspace and bank parsers.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {openAccountingWorkspace} from './stellar/scf-starforge-20261009/merchant-settlement-accounting/workspace/store.mjs';
import {ReceivablesWorkspace} from './stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/store.mjs';
import {XeroReceivablesWorkspace} from './stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/xero/store.mjs';
import {createReceivablesServer} from './stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/server.mjs';
import {json,sha,minor,receiptSummary,invoiceSummary,renderCustomerTar} from './stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/core.mjs';

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

const ORIGINAL_SAMPLES=[
  {
    "name": "bank-initial.ofx",
    "originalPath": "apps/ofx_statement_intake/samples/bank-initial.ofx",
    "gitBlob": "60a913d8a7943962f1e23fb5998525eefc10177e",
    "sha256": "6bd9002109f50da20db02eff3483af48f3f471e9fb6d53370fc0ce40c781c68a",
    "bytes": 1043,
    "content": "OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\nSECURITY:NONE\nENCODING:USASCII\nCHARSET:1252\nCOMPRESSION:NONE\nOLDFILEUID:NONE\nNEWFILEUID:NONE\n\n<OFX><SIGNONMSGSRSV1><SONRS><STATUS><CODE>0\n<SEVERITY>INFO\n</STATUS><DTSERVER>20260917120000\n<LANGUAGE>ENG\n<FI><ORG>SYNTHETIC-BANK\n<FID>001\n</FI></SONRS></SIGNONMSGSRSV1><BANKMSGSRSV1><STMTTRNRS><TRNUID>0\n<STATUS><CODE>0\n<SEVERITY>INFO\n</STATUS><STMTRS><CURDEF>USD\n<BANKACCTFROM><BANKID>000009876\n<ACCTID>00001234\n<ACCTTYPE>CHECKING\n</BANKACCTFROM><BANKTRANLIST><DTSTART>20260901\n<DTEND>20260917\n<STMTTRN><TRNTYPE>DEBIT\n<DTPOSTED>20260916103000[-4:EDT]\n<TRNAMT>1250.005\n<FITID>DEMO-RECEIPT-001\n<NAME>Synthetic customer receipt\n</STMTTRN><STMTTRN><TRNTYPE>DEBIT\n<DTPOSTED>20260916103000[-4:EDT]\n<TRNAMT>-12.50\n<FITID>DEMO-FEE-002\n<NAME>Synthetic bank fee\n</STMTTRN><STMTTRN><TRNTYPE>DEBIT\n<DTPOSTED>20240815\n<TRNAMT>-10\n<FITID>DEMO-OLDER-003\n<NAME>Synthetic late-added transaction\n</STMTTRN></BANKTRANLIST><LEDGERBAL><BALAMT>1727.505\n<DTASOF>20260917000000\n</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>"
  },
  {
    "name": "bank-overlap.ofx",
    "originalPath": "apps/ofx_statement_intake/samples/bank-overlap.ofx",
    "gitBlob": "edfaa8a7daef9efd3da6c6171a42727d1f9e6e54",
    "sha256": "72c40bc825799381e7f63f6cee9f42fda0cb12e3ffb57fbbcd67045c14974723",
    "bytes": 1439,
    "content": "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<?OFX OFXHEADER=\"200\" VERSION=\"230\" SECURITY=\"NONE\" OLDFILEUID=\"NONE\" NEWFILEUID=\"NONE\"?>\n<OFX><SIGNONMSGSRSV1><SONRS><STATUS><CODE>0</CODE><SEVERITY>INFO</SEVERITY></STATUS><DTSERVER>20260917120000</DTSERVER><LANGUAGE>ENG</LANGUAGE><FI><ORG>SYNTHETIC-BANK</ORG><FID>001</FID></FI></SONRS></SIGNONMSGSRSV1><BANKMSGSRSV1><STMTTRNRS><TRNUID>0</TRNUID><STATUS><CODE>0</CODE><SEVERITY>INFO</SEVERITY></STATUS><STMTRS><CURDEF>USD</CURDEF><BANKACCTFROM><BANKID>000009876</BANKID><ACCTID>00001234</ACCTID><ACCTTYPE>CHECKING</ACCTTYPE></BANKACCTFROM><BANKTRANLIST><DTSTART>20260901</DTSTART><DTEND>20260917</DTEND><STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260916103000[-4:EDT]</DTPOSTED><TRNAMT>1250.005</TRNAMT><FITID>DEMO-RECEIPT-001</FITID><NAME>Synthetic customer receipt</NAME></STMTTRN><STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260916103000[-4:EDT]</DTPOSTED><TRNAMT>0</TRNAMT><FITID>DEMO-CORRECTION-004</FITID><NAME>Synthetic deletion notice</NAME><CORRECTFITID>DEMO-FEE-002</CORRECTFITID><CORRECTACTION>DELETE</CORRECTACTION></STMTTRN></BANKTRANLIST><LEDGERBAL><BALAMT>1730.005</BALAMT><DTASOF>20260918</DTASOF></LEDGERBAL><BANKTRANLISTP><DTASOF>20260918</DTASOF><STMTTRNP><TRNTYPE>HOLD</TRNTYPE><DTTRAN>20260916103000[-4:EDT]</DTTRAN><TRNAMT>-25</TRNAMT><NAME>Synthetic authorization hold</NAME><DTEXPIRE>20260920</DTEXPIRE></STMTTRNP></BANKTRANLISTP></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>"
  },
  {
    "name": "demo-final.mt940",
    "originalPath": "apps/csv_intake_workbench/mt940/fixtures/demo-final.mt940",
    "gitBlob": "de007045904274ab057ac6fa9ac70a33d20671bf",
    "sha256": "2c555e06421b48bdc98755cd4229a20fdcdcdfa748a9a97198cdf2af854b0bc5",
    "bytes": 327,
    "content": ":20:DEMO20260916A\n:25:DEMO-EUR-OPERATING\n:28C:00180/00001\n:60F:C260915EUR1500,00\n:61:2609160916C300,00NTRFSALE001//DEMO-REF-A\n:86:/REMI/SYNTHETIC-INVOICE-001/\n:61:2609160916D50,25NCHGFEE001//DEMO-REF-B\n:86:SYNTHETIC SERVICE CHARGE\n:62F:C260916EUR1749,75\n:64:C260916EUR1700,00\n:86:SYNTHETIC TRAINING STATEMENT. NO REAL ACCOUNT.\n"
  }
];

const date=new Date().toISOString().slice(0,10),
  day=offset=>new Date(Date.parse(date+'T00:00:00Z')+offset*86400000).toISOString().slice(0,10),
  temporary=await mkdtemp(join(process.env.SCF_BANK_CHECK_TMP||tmpdir(),'scf-bank-customer-')),
  actor='Private original bank customer workflow',currency={code:'USD',scale:2},
  outcomes=[],sourceHashes={},invoiceHashes={};
let workspace,controller,server,stage='original workspace';
const file=(name,content)=>({name,dataBase64:Buffer.from(content).toString('base64')});
const sample=name=>{
  const row=ORIGINAL_SAMPLES.find(item=>item.name===name);assert.ok(row);
  const bytes=Buffer.from(row.content);assert.equal(bytes.length,row.bytes);assert.equal(sha(bytes),row.sha256);
  return row;
};
try {
  const directory=join(temporary,'accounting'),outboxDir=join(temporary,'outbox'),proofDir=join(temporary,'proofs'),termsFile=join(temporary,'terms.json');
  await mkdir(outboxDir,{mode:0o700});await mkdir(proofDir,{mode:0o700});
  await writeFile(termsFile,json({schema:'stellar-forge.merchant-accounting-terms.v1',routes:[{
    routeId:'bank-customer-check',method:'GET',network:'stellar:testnet',
    asset:sourceStrKey(16,1),payTo:sourceStrKey(48,2),amountAtomic:'1000000',
    unitPriceUsd:'1',unitCostUsd:null,priceBasis:'Original private customer bank workflow'
  }]}),{mode:0o600});
  async function openOriginal(){
    workspace=await openAccountingWorkspace({directory,outboxDir,proofDir,termsFile});
    controller=await new ReceivablesWorkspace(workspace).init();
  }
  await openOriginal();
  const op=value=>({revision:workspace.state.revision,actor,requestId:randomUUID(),...value});
  const customer=async(reference,name)=>(await controller.saveCustomer({
    revision:workspace.state.revision,actor,reference,name,email:'',address:'',note:''})).customer;
  const a=await customer('BANK-A','Original customer A'),b=await customer('BANK-B','Original customer B'),
    c=await customer('BANK-C','Original customer C'),d=await customer('BANK-D','Original customer D');
  await controller.settings(op({name:'Original bank receipt merchant',invoicePrefix:'BNK',creditPrefix:'BCR'}));
  async function issue(customer,amount,{unit=currency,issued=day(-20)}={}){
    const saved=await controller.saveDraft(op({customerId:customer.id,currency:unit,issueDate:issued,dueDate:day(30),
      lines:[{id:'service',description:'Original implementation service',quantity:'1',unitAmount:amount}]}));
    const reviewed=await controller.preview(saved.invoice.id),invoice=(await controller.issue(saved.invoice.id,op({
      expectedVersion:reviewed.expectedVersion,previewSha256:reviewed.previewSha256}))).invoice;
    invoiceHashes[invoice.id]=sha((await controller.file(invoice.id,'invoice.json')).bytes);return invoice.id;
  }
  const invoiceA=await issue(a,'100.00'),invoiceB=await issue(b,'50.00'),
    invoiceC=await issue(c,'65.00'),invoiceD=await issue(d,'35.00'),correctedInvoice=await issue(c,'40.00');
  const original=(await controller.receipt(op({customerId:a.id,currency,amount:'100.00',receivedDate:day(-10),
    method:'Bank transfer',reference:'AGGREGATE-A-100'}))).receipt;
  const originalAllocation=(await controller.allocate(op({invoiceId:invoiceA,receiptId:original.id,
    amount:'100.00',allocatedDate:day(-9)}))).allocation;
  await controller.release(originalAllocation.id,op({releasedDate:day(5),reason:'Original scheduled future reallocation'}));
  const manualB=(await controller.receipt(op({customerId:b.id,currency,amount:'50.00',receivedDate:day(-7),
    method:'Bank transfer',reference:'B-EXISTING-50'}))).receipt;
  await controller.allocate(op({invoiceId:invoiceB,receiptId:manualB.id,amount:'50.00',allocatedDate:day(-7)}));
  const csvLayout={delimiter:';',dateFormat:'YYYY-MM-DD',decimalMark:'.',groupSeparator:'',
    amountMode:'SIGNED',creditSign:'POSITIVE',columns:{
      date:'Booked',amount:'Amount',transactionId:'Bank ID',reference:'Reference',counterparty:'Counterparty',invoiceReference:'Invoice'}};
  const account=(await controller.saveBankAccount(op({reference:'OPERATING-USD',name:'Original USD operating account',
    currency,bankId:'BANK-CHECK',accountReference:'BANK-001',method:'Bank transfer',csvLayout}))).bankAccount;
  const csv='\uFEFFBooked;Amount;Bank ID;Reference;Counterparty;Invoice\n'+
    day(-8)+';40.00;CREDIT-A-40;AGGREGATE-A-100;Original customer A;\n'+
    day(-8)+';60.00;CREDIT-A-60;AGGREGATE-A-100;Original customer A;\n'+
    day(-6)+';150.00;MULTI-CUSTOMER-150;"Three customer remittance\nOriginal source line";Processor;\n'+
    day(-5)+';20.00;UNASSIGNED-20;Later matched payment;Original customer D;\n'+
    day(-5)+';-7.00;FEE-7;Bank service charge;Bank;\n'+
    day(-5)+';0.00;NOTICE-0;Statement notice;Bank;\n';
  stage='partial CSV inspection and original source capture';
  const partial=await controller.inspectBankSource({accountId:account.id,format:'CSV',file:file('original-customer-bank.csv',csv),
    csvLayout:{delimiter:';',columns:{}}});
  assert.equal(partial.requiresLayout,true);assert.deepEqual(partial.columns,Object.values(csvLayout.columns));
  const beforeReceipts=controller.data().receipts.length,
    imported=await controller.importBankSource(op({accountId:account.id,format:'CSV',
      file:file('original-customer-bank.csv',csv),csvLayout}));
  const importId=imported.bankImport.id,detail=await controller.bankImport(importId,{view:'rows',limit:500});
  assert.equal(controller.data().receipts.length,beforeReceipts);assert.equal(detail.total,6);
  assert.ok(Array.isArray(detail.files));
  const row=id=>detail.items.find(item=>item.transactionId===id);
  assert.match(row('MULTI-CUSTOMER-150').raw.fields.Reference,/remittance\nOriginal source line/);
  sourceHashes.csv=sha((await controller.bankImportFile(importId,'source.csv')).bytes);
  assert.equal(sourceHashes.csv,sha(Buffer.from(csv)));
  assert.equal((await controller.bankImport(importId,{view:'rows',direction:'CREDIT',search:'AGGREGATE',limit:1})).total,2);
  outcomes.push('Original semicolon/BOM/quoted-newline CSV inspection, complete mapping and immutable source capture leave cash unchanged.');

  stage='multiple real source credits cover one original aggregate';
  const coveragePreview=await controller.previewBankPosting(importId,{selections:[
    {rowId:row('CREDIT-A-40').id,splits:[{action:'LINK',receiptId:original.id,amount:'40.00',
      dateDifferenceReason:'Original customer receipt predates these bank settlement entries.',allocations:[]}]},
    {rowId:row('CREDIT-A-60').id,splits:[{action:'LINK',receiptId:original.id,amount:'60.00',
      dateDifferenceReason:'Original customer receipt predates these bank settlement entries.',allocations:[]}]}
  ]});
  assert.equal(coveragePreview.proposal.selections[1].splits[0].sourceCoverage.afterMatchedAmount,'100.00');
  assert.equal(coveragePreview.proposal.selections[1].splits[0].sourceCoverage.remainingUnmatchedAmount,'0.00');
  const coverageInput=op({proposal:coveragePreview.proposal,reviewSha256:coveragePreview.reviewSha256}),
    covered=await controller.postBankReceipts(importId,coverageInput);
  assert.deepEqual(covered.operation.result.receiptIds,[original.id]);
  assert.equal(controller.data().receipts.length,beforeReceipts);
  assert.equal(controller._receipt(original.id).bankSources.length,2);
  assert.equal(receiptSummary(controller._receipt(original.id),controller.data(),date).allocated,'100.00');
  const again=await controller.postBankReceipts(importId,coverageInput);
  assert.equal(again.operation.replayed,true);assert.equal(controller._receipt(original.id).bankSources.length,2);
  const savedIntent={...coverageInput,bankImportId:importId};delete savedIntent.revision;
  assert.equal(again.operation.intentSha256,sha(json({action:'bank_receipts_posted',value:savedIntent})));
  await assert.rejects(controller.previewBankPosting(importId,{selections:[{rowId:row('UNASSIGNED-20').id,
    splits:[{action:'LINK',receiptId:original.id,amount:'20.00',dateDifferenceReason:'Source assignment review',allocations:[]}]}]}),
    {code:'BANK_RECEIPT_COVERAGE_EXCEEDED'});
  outcomes.push('Distinct40+60 source credits cover one100 receipt without new cash; stable intent replay and source coverage capacity are retained.');

  stage='one deposit split across existing and new customer receipts';
  const splitPreview=await controller.previewBankPosting(importId,{selections:[{rowId:row('MULTI-CUSTOMER-150').id,splits:[
    {action:'LINK',receiptId:manualB.id,amount:'50.00',dateDifferenceReason:'The customer receipt was recorded before the bank posted the batch.',allocations:[]},
    {action:'CREATE',customerId:c.id,amount:'65.00',allocations:[{invoiceId:invoiceC,amount:'65.00'}]},
    {action:'CREATE',customerId:d.id,amount:'35.00',allocations:[{invoiceId:invoiceD,amount:'35.00'}]}
  ]}]});
  const split=await controller.postBankReceipts(importId,op({proposal:splitPreview.proposal,reviewSha256:splitPreview.reviewSha256}));
  assert.equal(split.bankPosting.totals.sourceCredits,'150.00');
  assert.equal(split.bankPosting.totals.linkedReceiptAmount,'50.00');
  assert.equal(split.bankPosting.totals.createdReceiptAmount,'100.00');
  for(const id of [invoiceB,invoiceC,invoiceD])assert.equal(invoiceSummary(controller._invoice(id),controller.data(),date).amountDue,'0.00');
  await controller.ignoreBankRows(importId,op({rowIds:[row('UNASSIGNED-20').id],reason:'Statement owner initially marked this payment as requiring later attribution.'}));
  await controller.closeBankImport(importId,op({reason:'All current incoming credits are assigned or explicitly retained for later attribution.'}));
  assert.equal((await controller.bankImport(importId)).bankImport.status,'CLOSED');
  await controller.restoreBankRows(importId,op({rowIds:[row('UNASSIGNED-20').id],reason:'Resolve the original retained incoming payment and correct customer allocation.'}));
  assert.equal((await controller.bankImport(importId)).bankImport.status,'OPEN');
  outcomes.push('One150 deposit links an existing50 receipt and creates65/35 for two other customers; original ignore/close/restore reopens the same source.');

  stage='dated refund reservation and source-specific residual correction';
  await controller.credit(invoiceA,op({creditDate:date,reason:'Agreed original-customer ten-dollar credit',
    lines:[{invoiceLineId:'service',netAmount:'10.00'}]}));
  const refundPreview=await controller.previewRefund({receiptId:original.id,amount:'10.00',effectiveDate:date,
    reason:'Prepare the agreed customer credit for a possible refund',funding:[{allocationId:originalAllocation.id,amount:'10.00'}],
    payout:{kind:'STELLAR_TRANSFER',sourceAccount:sourceStrKey(48,3),destination:sourceStrKey(48,4),
      network:'stellar:pubnet',asset:{kind:'native'},stellarAmount:'1.0000000',
      valuationNote:'Explicit ten-dollar commercial valuation for the one-XLM private payment request'}});
  const refund=await controller.commitRefund(op({proposal:refundPreview.proposal,reviewSha256:refundPreview.reviewSha256}));
  assert.equal(refund.receipt.reserved,'10.00');
  const correctedInput={selections:[{rowId:row('CREDIT-A-40').id,splits:[{
    action:'CORRECT',receiptId:original.id,customerId:c.id,amount:'40.00',effectiveDate:date,
    reason:'This40 payment belongs to customer C; retain the other60 with original customer A.',
    allocations:[{invoiceId:correctedInvoice,amount:'40.00',allocatedDate:date}],
    residualAllocations:[{invoiceId:invoiceA,amount:'60.00',allocatedDate:date}]
  }]}]};
  await assert.rejects(controller.previewBankPosting(importId,correctedInput),{code:'RECEIPT_FUNDS_ALREADY_COMMITTED'});
  await controller.cancelRefund(refund.refund.id,op({cancelledDate:date,
    reason:'Cancel the unsent wallet request while assigning the original bank payment to its actual customer.'}));
  const afterRefundRelease=controller.data().allocations.find(item=>item.receiptId===original.id&&
    item.replacesAllocationId===originalAllocation.id);
  assert.ok(afterRefundRelease);assert.equal(afterRefundRelease.releasedDate,day(5));
  const correctionPreview=await controller.previewBankPosting(importId,correctedInput),
    correctionSplit=correctionPreview.proposal.selections[0].splits[0],
    residual=correctionSplit.residualReceipt;
  assert.equal(correctionSplit.correctedOriginalAmount,'40.00');
  assert.equal(residual.amount,'60.00');assert.equal(residual.customer.id,a.id);
  assert.equal(residual.receivedDate,original.receivedDate);assert.equal(residual.accountingDate,date);
  assert.equal(residual.bankSources.length,1);
  assert.equal(correctionSplit.replacementReceiptIds.length,2);
  assert.equal(correctionSplit.releasedAllocations[0].previousReleasedDate,day(5));
  const corrected=await controller.postBankReceipts(importId,op({
    proposal:correctionPreview.proposal,reviewSha256:correctionPreview.reviewSha256}));
  assert.ok(corrected.operation.result.receiptIds.includes(original.id));
  assert.ok(corrected.operation.result.receiptIds.includes(correctionSplit.receiptId));
  assert.ok(corrected.operation.result.receiptIds.includes(residual.id));
  assert.equal(invoiceSummary(controller._invoice(invoiceA),controller.data(),day(-1)).paid,'100.00');
  assert.equal(invoiceSummary(controller._invoice(invoiceA),controller.data(),date).paid,'60.00');
  assert.equal(invoiceSummary(controller._invoice(invoiceA),controller.data(),date).amountDue,'30.00');
  assert.equal(invoiceSummary(controller._invoice(correctedInvoice),controller.data(),date).paid,'40.00');
  assert.equal(controller._receipt(original.id).replacedByReceiptId,null);
  assert.deepEqual(controller._receipt(original.id).replacementReceiptIds,correctionSplit.replacementReceiptIds);
  assert.equal(controller._allocation(afterRefundRelease.id).releasedDate,date);
  assert.ok(controller._allocation(afterRefundRelease.id).history.some(item=>item.previousReleasedDate===day(5)));
  const originalCoverageSum=controller._receipt(residual.id).bankSources.reduce((sum,item)=>sum+minor(item.splitAmount,currency),0n);
  assert.equal(originalCoverageSum,6000n);
  outcomes.push('A live refund reservation prevents receipt correction; cancellation permits a dated40 successor for C plus60 residual for A, with explicit allocations and prior future-release history.');

  stage='overlapping export follows exact current coverage successor';
  const overlapCsv='Booked;Amount;Bank ID;Reference;Counterparty;Invoice\n'+
    day(-8)+';60.00;CREDIT-A-60;AGGREGATE-A-100;Original customer A;\n';
  const overlap=(await controller.importBankSource(op({accountId:account.id,format:'CSV',file:file('later-overlap.csv',overlapCsv),csvLayout}))).bankImport;
  const overlapRow=(await controller.bankImport(overlap.id,{view:'rows'})).items[0];
  assert.equal(overlapRow.status,'DUPLICATE');
  assert.ok(overlapRow.sourceMatches.some(item=>item.receiptIds.includes(residual.id)));
  assert.ok(!overlapRow.sourceMatches.some(item=>item.receiptIds.includes(correctionSplit.receiptId)));
  const overlapPreview=await controller.previewBankPosting(overlap.id,{selections:[{rowId:overlapRow.id,splits:[{
    action:'LINK',receiptId:residual.id,amount:'60.00',dateDifferenceReason:'Original receipt and correction dates remain separate from this bank export.',allocations:[]}]}]});
  assert.equal(overlapPreview.proposal.selections[0].splits[0].sourceCoverage.repeatedSource,true);
  assert.equal(overlapPreview.proposal.selections[0].splits[0].sourceCoverage.newlyMatchedAmount,'0.00');
  await controller.postBankReceipts(overlap.id,op({proposal:overlapPreview.proposal,reviewSha256:overlapPreview.reviewSha256}));
  assert.equal(controller._receipt(residual.id).bankSources.length,2);
  await controller.closeBankImport(overlap.id,op({reason:'Original overlapping source linked to its retained current residual.'}));
  const lastInvoice=await issue(d,'20.00'),lastPreview=await controller.previewBankPosting(importId,{selections:[
    {rowId:row('UNASSIGNED-20').id,splits:[{action:'CREATE',customerId:d.id,amount:'20.00',
      allocations:[{invoiceId:lastInvoice,amount:'20.00'}]}]}]});
  const lastPosted=await controller.postBankReceipts(importId,op({proposal:lastPreview.proposal,reviewSha256:lastPreview.reviewSha256}));
  await controller.closeBankImport(importId,op({reason:'Every original incoming cash row is assigned and source correction is complete.'}));
  outcomes.push('An overlapping60 bank row follows only the original-customer residual, reuses source coverage once and preserves the corrected customer payment.');

  stage='unchanged original OFX SGML and XML samples';
  const usd3={code:'USD',scale:3},ofxAccount=(await controller.saveBankAccount(op({reference:'ORIGINAL-OFX',
    name:'Original OFX sample account',currency:usd3,bankId:'000009876',accountReference:'00001234'}))).bankAccount;
  const ofxInput={accountId:ofxAccount.id,format:'OFX',file:file(sample('bank-initial.ofx').name,sample('bank-initial.ofx').content)},
    ofxInspection=await controller.inspectBankSource(ofxInput);
  const incoming=ofxInspection.rows.items.find(item=>item.transactionId==='DEMO-RECEIPT-001');
  assert.equal(incoming.amount,'1250.005');assert.equal(incoming.kind,'CREDIT');
  assert.equal(incoming.raw.fields.TRNTYPE,'DEBIT');assert.equal(incoming.bookedDate,'2026-09-16');
  assert.match(incoming.sourceIdentity.typedRowSha256,/^[a-f0-9]{64}$/);
  const ofxImport=(await controller.importBankSource(op(ofxInput))).bankImport,
    ofxRows=await controller.bankImport(ofxImport.id,{view:'rows'}),ofxRow=ofxRows.items.find(item=>item.transactionId==='DEMO-RECEIPT-001'),
    ofxInvoice=await issue(a,'1250.005',{unit:usd3,issued:'2026-09-01'}),
    ofxPreview=await controller.previewBankPosting(ofxImport.id,{selections:[{rowId:ofxRow.id,splits:[
      {action:'CREATE',customerId:a.id,amount:'1250.005',allocations:[{invoiceId:ofxInvoice,amount:'1250.005'}]}]}]});
  const ofxPosted=await controller.postBankReceipts(ofxImport.id,op({proposal:ofxPreview.proposal,reviewSha256:ofxPreview.reviewSha256})),
    ofxReceiptId=ofxPosted.bankPosting.receiptIds[0];
  sourceHashes.ofxInitial=sha((await controller.bankImportFile(ofxImport.id,'source.ofx')).bytes);
  assert.equal(sourceHashes.ofxInitial,sample('bank-initial.ofx').sha256);
  const report=JSON.parse((await controller.bankImportFile(ofxImport.id,'parser-report.json')).bytes);
  assert.equal(report.sources[0].sha256,sourceHashes.ofxInitial);
  const ofxOverlap=(await controller.importBankSource(op({accountId:ofxAccount.id,format:'OFX',
    file:file(sample('bank-overlap.ofx').name,sample('bank-overlap.ofx').content)}))).bankImport,
    ofxOverlapRows=(await controller.bankImport(ofxOverlap.id,{view:'rows'})).items,
    ofxOverlapCredit=ofxOverlapRows.find(item=>item.transactionId==='DEMO-RECEIPT-001');
  assert.equal(ofxOverlapCredit.status,'DUPLICATE');
  assert.ok(ofxOverlapRows.some(item=>item.sourceIdentity?.correctionAction==='DELETE'&&item.status==='SOURCE_ONLY'));
  assert.ok(ofxOverlapRows.some(item=>item.sourceIssues.includes('PENDING_OBSERVATION')&&item.status==='SOURCE_ONLY'));
  const ofxOverlapPreview=await controller.previewBankPosting(ofxOverlap.id,{selections:[{rowId:ofxOverlapCredit.id,splits:[
    {action:'LINK',receiptId:ofxReceiptId,amount:'1250.005',allocations:[]}]}]});
  assert.equal(ofxOverlapPreview.proposal.selections[0].splits[0].sourceCoverage.newlyMatchedAmount,'0.000');
  await controller.postBankReceipts(ofxOverlap.id,op({proposal:ofxOverlapPreview.proposal,reviewSha256:ofxOverlapPreview.reviewSha256}));
  outcomes.push('Exact original OFX SGML/XML bytes preserve signed amount1250.005, DTPOSTED local date, Python typed-row digest, overlap identity, pending observations and DELETE source rows.');

  stage='original OFX parser receives an explicit replacement document';
  const correctionOfx=sample('bank-initial.ofx').content
    .replace('<TRNAMT>1250.005\n<FITID>DEMO-RECEIPT-001\n',
      '<TRNAMT>1200.005\n<FITID>DEMO-REPLACEMENT-005\n<CORRECTFITID>DEMO-RECEIPT-001\n<CORRECTACTION>REPLACE\n')
    .replace('<BALAMT>1727.505\n','<BALAMT>1677.505\n');
  assert.notEqual(correctionOfx,sample('bank-initial.ofx').content);
  sourceHashes.ofxReplacement=sha(Buffer.from(correctionOfx));
  const replacementImport=(await controller.importBankSource(op({accountId:ofxAccount.id,format:'OFX',
    file:file('derived-replacement.ofx',correctionOfx)}))).bankImport,
    replacementRow=(await controller.bankImport(replacementImport.id,{view:'rows'})).items.find(item=>item.transactionId==='DEMO-REPLACEMENT-005');
  assert.equal(replacementRow.sourceIdentity.correctionAction,'REPLACE');assert.equal(replacementRow.requiresSourceResolution,true);
  const replacementPreview=await controller.previewBankPosting(replacementImport.id,{selections:[{rowId:replacementRow.id,
    sourceResolutionReason:'Explicit private replacement document corrects the retained original FITID amount by50.000.',
    splits:[{action:'CORRECT',receiptId:ofxReceiptId,customerId:a.id,amount:'1200.005',effectiveDate:date,
      reason:'Retain the original1250.005 history and apply the replacement1200.005 from this accounting date.',
      allocations:[{invoiceId:ofxInvoice,amount:'1200.005',allocatedDate:date}]}]}]});
  const replacement=await controller.postBankReceipts(replacementImport.id,op({
    proposal:replacementPreview.proposal,reviewSha256:replacementPreview.reviewSha256}));
  const replacedReceiptId=replacementPreview.proposal.selections[0].splits[0].receiptId;
  assert.equal(invoiceSummary(controller._invoice(ofxInvoice),controller.data(),day(-1)).paid,'1250.005');
  assert.equal(invoiceSummary(controller._invoice(ofxInvoice),controller.data(),date).amountDue,'50.000');
  assert.equal(controller._receipt(ofxReceiptId).replacedByReceiptId,replacedReceiptId);
  assert.ok(controller._receipt(replacedReceiptId).bankSources[0].transactionAliases.includes(ofxRow.transactionKey));
  await assert.rejects(controller.previewBankPosting(ofxImport.id,{selections:[{rowId:ofxRow.id,
    sourceResolutionReason:'A stale original source cannot undo a later retained replacement.',
    splits:[{action:'CORRECT',receiptId:replacedReceiptId,customerId:a.id,amount:'1250.005',effectiveDate:date,
      reason:'Deliberate stale-source check',allocations:[]}]}]}),{code:'BANK_SOURCE_SUPERSEDED'});
  outcomes.push('The unchanged original OFX parser binds a declared replacement to its retained target, preserves dated old/new amounts and rejects stale source cash resurrection.');

  stage='unchanged original MT940 page';
  const eur={code:'EUR',scale:2},mtAccount=(await controller.saveBankAccount(op({reference:'ORIGINAL-MT940',
    name:'Original MT940 operating account',currency:eur,bankId:'',accountReference:'DEMO-EUR-OPERATING'}))).bankAccount,
    mtInput={accountId:mtAccount.id,format:'MT940',file:file(sample('demo-final.mt940').name,sample('demo-final.mt940').content),
      statementOptions:{profile:'TEXT_BODY',encoding:'ASCII',debitCreditProfile:'CD_ONLY',yearWindowStart:1970,dateBasis:'VALUE_DATE'}},
    mtInspection=await controller.inspectBankSource(mtInput);
  assert.deepEqual(mtInspection.sections[0].openingBalance,{date:'2026-09-15',amount:'1500.00'});
  assert.deepEqual(mtInspection.sections[0].closingBalance,{date:'2026-09-16',amount:'1749.75'});
  const mtImport=(await controller.importBankSource(op(mtInput))).bankImport,
    mtRows=(await controller.bankImport(mtImport.id,{view:'rows'})).items,mtCredit=mtRows.find(item=>item.kind==='CREDIT');
  assert.equal(mtCredit.amount,'300.00');assert.equal(mtCredit.bookedDate,'2026-09-16');
  assert.equal(mtCredit.dateBasis,'MT940_VALUE_DATE');assert.equal(mtCredit.transactionIdentity,'STATEMENT_POSITION');
  assert.equal(mtCredit.originalEntryMonthDay,'0916');assert.equal(mtRows.find(item=>item.kind==='DEBIT').amount,'-50.25');
  const mtInvoice=await issue(d,'300.00',{unit:eur,issued:'2026-09-01'}),
    mtPreview=await controller.previewBankPosting(mtImport.id,{selections:[{rowId:mtCredit.id,
      sourceResolutionReason:'Reviewed the supplied original page and its explicit value-date basis.',
      splits:[{action:'CREATE',customerId:d.id,amount:'300.00',allocations:[{invoiceId:mtInvoice,amount:'300.00'}]}]}]});
  await controller.postBankReceipts(mtImport.id,op({proposal:mtPreview.proposal,reviewSha256:mtPreview.reviewSha256}));
  sourceHashes.mt940=sha((await controller.bankImportFile(mtImport.id,'source.mt940')).bytes);
  assert.equal(sourceHashes.mt940,sample('demo-final.mt940').sha256);
  assert.equal(invoiceSummary(controller._invoice(mtInvoice),controller.data(),date).amountDue,'0.00');
  outcomes.push('Exact original MT940 page retains opening/closing balances, explicit century/encoding/reversal profile, full value date and statement-position identity before native receipt posting.');

  stage='original bank credit disposition and Xero cash handover';
  const customerCredit=await controller.credit(lastInvoice,op({creditDate:date,reason:'Agreed five-dollar credit on the original customer payment',
    lines:[{invoiceLineId:'service',netAmount:'5.00'}]})),dispositionInvoice=await issue(d,'5.00');
  const dispositionPreview=await controller.previewCreditDisposition({receiptId:lastPosted.operation.result.receiptIds[0],
    effectiveDate:date,reason:'Apply the original bank-funded customer credit to the next invoice',
    funding:[{allocationId:lastPosted.operation.result.allocationIds[0],amount:'5.00'}],
    allocations:[{invoiceId:dispositionInvoice,amount:'5.00'}]});
  const disposition=await controller.applyCreditDisposition(op({
    proposal:dispositionPreview.proposal,reviewSha256:dispositionPreview.reviewSha256}));
  assert.equal(disposition.receipt.available,'0.00');
  assert.equal(invoiceSummary(controller._invoice(dispositionInvoice),controller.data(),date).amountDue,'0.00');
  const xero=await new XeroReceivablesWorkspace(controller).init(),headers=['*ContactName','EmailAddress','*InvoiceNumber','Reference',
    '*InvoiceDate','*DueDate','*Description','*Quantity','*UnitAmount','Discount','*AccountCode','*TaxType','Currency','BrandingTheme'],
    template=Buffer.from('\uFEFF'+headers.join(',')+'\r\n'),
    profile=(await xero.saveProfile(op({name:'Original customer cash handover',organisation:'Private native Xero organisation',
      currency,invoiceDateFormat:'MM/DD/YYYY',creditDateFormat:'DD/MM/YYYY',accountCode:'200',taxType:'Tax on Sales',
      contacts:[a,b,c,d].map(item=>({customerId:item.id,contactName:item.name})),lineMappings:[],
      invoiceTemplate:file('original-invoice-template.csv',template),creditTemplate:file('original-credit-template.csv',template)}))).profile,
    documentIds=[...controller.data().invoices.filter(item=>item.document?.currency.code==='USD'&&item.document.currency.scale===2).map(item=>item.id),
      ...controller.data().credits.filter(item=>item.document.currency.code==='USD'&&item.document.currency.scale===2).map(item=>item.id)],
    xeroSelection={profileId:profile.id,documentIds,asOf:date},xeroPreview=await xero.preview(xeroSelection);
  assert.equal(xeroPreview.ready,true);
  const handover=await xero.prepare(op({...xeroSelection,previewSha256:xeroPreview.previewSha256,title:'Original native customer bank handover'})),
    xeroPackageId=handover.package.id,
    snapshot=JSON.parse((await xero.file(xeroPackageId,'original-account-snapshot.json')).bytes),
    cashFiles=JSON.parse((await xero.file(xeroPackageId,'customer-cash-files.json')).bytes);
  assert.ok(snapshot.receipts.some(item=>item.id===residual.id&&item.accountingDate===date));
  assert.ok(snapshot.refunds.some(item=>item.id===refund.refund.id));
  assert.ok(snapshot.creditDispositions.some(item=>item.id===disposition.creditDisposition.id));
  assert.match(JSON.stringify(cashFiles),/documents\/bank-/);
  const xeroExport=await xero.export(xeroPackageId);
  assert.ok(xeroExport.files.some(item=>item.name.startsWith('cash-')&&item.bytes.length));
  sourceHashes.xeroCashSnapshot=sha((await xero.file(xeroPackageId,'original-account-snapshot.json')).bytes);
  outcomes.push('A bank-funded customer credit transfers to the next original invoice; Xero handover retains accounting dates, refund/disposition records and exact customer cash advice.');

  stage='original customer advice, protocol files and reopen';
  const exportA=await controller.exportCustomer(a.id,{asOf:date}),exportC=await controller.exportCustomer(c.id,{asOf:date}),
    aAdvice=exportA.files.filter(item=>item.name.startsWith('documents/bank-')),
    cAdvice=exportC.files.filter(item=>item.name.startsWith('documents/bank-'));
  assert.ok(aAdvice.some(item=>item.name.endsWith('receipt-'+residual.id+'.json')));
  assert.ok(aAdvice.some(item=>item.name.endsWith('receipt-'+original.id+'.json')));
  assert.ok(cAdvice.some(item=>item.name.endsWith('receipt-'+correctionSplit.receiptId+'.json')));
  assert.ok(!aAdvice.some(item=>item.name.endsWith('receipt-'+correctionSplit.receiptId+'.json')));
  assert.ok(!cAdvice.some(item=>item.name.endsWith('receipt-'+residual.id+'.json')));
  for(const item of [...aAdvice,...cAdvice])assert.ok(!item.name.endsWith('source.csv')&&!item.name.endsWith('rows.json'));
  const beforeCorrection=await controller.exportCustomer(a.id,{asOf:day(-1)});
  assert.ok(!beforeCorrection.files.some(item=>item.name.endsWith('receipt-'+residual.id+'.json')));
  const customerTar=renderCustomerTar(exportA.files);assert.ok(customerTar.length>0);
  const savedAdvice=sha((await controller.bankImportFile(importId,'receipt-'+residual.id+'.json')).bytes);
  const reconciliation=JSON.parse((await controller.bankImportFile(importId,'reconciliation.json')).bytes);
  assert.ok(reconciliation.receipts.some(item=>item.id===correctionSplit.receiptId));
  assert.ok(reconciliation.receipts.some(item=>item.id===residual.id));
  for(const [id,hash]of Object.entries(invoiceHashes))assert.equal(sha((await controller.file(id,'invoice.json')).bytes),hash);
  server=await createReceivablesServer({workspace,port:0});
  const origin=new URL(server.url).origin;
  const asset=await fetch(new URL('bank-statements.mjs',server.url));assert.equal(asset.status,200);
  assert.equal(sha(Buffer.from(await asset.arrayBuffer())),sha(await readFile(new URL(
    './stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/public/bank-statements.mjs',import.meta.url))));
  const httpAccounts=await fetch(origin+'/api/receivables/bank-accounts');assert.equal(httpAccounts.status,200);
  assert.equal((await httpAccounts.json()).accounts.length,3);
  const httpRows=await fetch(origin+'/api/receivables/bank-imports/'+importId+'?view=rows&direction=CREDIT&limit=1');
  assert.equal(httpRows.status,200);const httpDetail=await httpRows.json();assert.equal(httpDetail.total,4);assert.ok(Array.isArray(httpDetail.files));
  const httpSource=await fetch(origin+'/api/receivables/bank-imports/'+importId+'/files/source.csv');
  assert.equal(httpSource.status,200);assert.equal(sha(Buffer.from(await httpSource.arrayBuffer())),sourceHashes.csv);
  await server.close();server=null;
  const committedRevision=workspace.state.revision;
  await workspace.close();workspace=null;await openOriginal();
  assert.equal(workspace.state.revision,committedRevision);
  assert.equal((await controller.bankImport(importId)).bankImport.status,'CLOSED');
  assert.equal(sha((await controller.bankImportFile(importId,'receipt-'+residual.id+'.json')).bytes),savedAdvice);
  assert.equal(sha((await controller.bankImportFile(ofxImport.id,'source.ofx')).bytes),sourceHashes.ofxInitial);
  const reopenedXero=await new XeroReceivablesWorkspace(controller).init();
  assert.equal(sha((await reopenedXero.file(xeroPackageId,'original-account-snapshot.json')).bytes),sourceHashes.xeroCashSnapshot);
  const recovered=await controller.postBankReceipts(importId,coverageInput);
  assert.equal(recovered.operation.replayed,true);assert.equal(recovered.operation.id,coverageInput.requestId);
  assert.deepEqual(controller._receipt(original.id).replacementReceiptIds,correctionSplit.replacementReceiptIds);
  assert.equal(invoiceSummary(controller._invoice(invoiceA),controller.data(),date).paid,'60.00');
  outcomes.push('Original customer files include every applicable old/new/residual advice, preserve customer separation and historical dates; live bank asset/API/source routes and original request recovery survive close/reopen.');
  const stored=JSON.parse(await readFile(join(directory,'workspace.json'),'utf8'));
  const result={schema:'stellar-forge.bank-customer-native-check.v1',result:'PASS',runtime:process.version,
    originalParserSource:{repository:'woahwhattheheck/smb-showcase-inventory',tree:'2ca0540e094d855f59562abe67b22d0e5a87768c',
      ofx:'c19b38f228283c31926fe9eae86a6364a7976943',mt940:'ee5a99c5b747e402bfb1f51175e61799859d3121'},
    exactSamples:ORIGINAL_SAMPLES.map(({content,...identity})=>identity),sourceHashes,invoiceHashes,
    revision:stored.revision,accounts:stored.receivables.bankAccounts.length,imports:stored.receivables.bankImports.length,
    receipts:stored.receivables.receipts.length,allocations:stored.receivables.allocations.length,
    customerTarSha256:sha(customerTar),outcomes,
    ...(process.env.SCF_KEEP_BANK_CHECK?{directory:temporary}:{})};
  if(process.env.SCF_BANK_CHECK_RESULT)await writeFile(process.env.SCF_BANK_CHECK_RESULT,json(result),{mode:0o600});
  process.stdout.write(json(result));
} catch(error) {
  process.stderr.write(json({schema:'stellar-forge.bank-customer-native-check.v1',result:'FAIL',stage,
    code:error.code??null,message:String(error.message),...(process.env.SCF_KEEP_BANK_CHECK?{directory:temporary}:{})}));
  process.exitCode=1;
} finally {
  if(server)await server.close().catch(()=>{});
  if(workspace)await workspace.close().catch(()=>{});
  if(!process.env.SCF_KEEP_BANK_CHECK)await rm(temporary,{recursive:true,force:true});
}
