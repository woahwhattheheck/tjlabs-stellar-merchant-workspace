#!/usr/bin/env node
// MIT. One original customer cash lifecycle through the maintained Xero HTTP client.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {openAccountingWorkspace} from './stellar/scf-starforge-20261009/merchant-settlement-accounting/workspace/store.mjs';
import {createXeroReceivablesServer} from './stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/xero/server.mjs';
import {XeroReceivablesClient,xeroCashCaptureArguments} from './stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/xero/client.mjs';
import {json,sha,invoiceSummary,receiptSummary} from './stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/core.mjs';

function sourceStrKey(version,fill) {
  const bytes=Buffer.alloc(35,fill);bytes[0]=version;let crc=0;
  for(const byte of bytes.subarray(0,33)){crc^=byte<<8;for(let i=0;i<8;i++)crc=((crc<<1)^(crc&0x8000?0x1021:0))&65535;}
  bytes[33]=crc&255;bytes[34]=crc>>8;
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let result='',bits=0,acc=0;
  for(const byte of bytes){acc=(acc<<8)|byte;bits+=8;while(bits>=5){bits-=5;result+=alphabet[(acc>>>bits)&31];}acc&=(1<<bits)-1;}
  return result;
}
const actor='Original Xero customer cash commissioning';
const currency={code:'USD',scale:2},dayMs=86400000;
const asOf=process.env.SCF_CASH_AS_OF??new Date().toISOString().slice(0,10);
assert.match(asOf,/^\d{4}-\d{2}-\d{2}$/);
const baseDate=Date.parse(asOf+'T00:00:00.000Z');
assert.equal(new Date(baseDate).toISOString().slice(0,10),asOf);
const day=n=>new Date(baseDate+n*dayMs).toISOString().slice(0,10);
const observed=(n,time='12:00:00.000')=>day(n)+'T'+time+'Z';
const msdate=date=>'/Date('+Date.parse(date+'T00:00:00.000Z')+'+0000)/';
const upload=(name,bytes)=>({name,dataBase64:Buffer.from(bytes).toString('base64')});
const copy=value=>structuredClone(value);
const sourceRoot=fileURLToPath(new URL('.',import.meta.url));
const outcomes=[],sourceHashes={},invoiceHashes={},identities={};
const scratch=await mkdtemp(join(process.env.SCF_CASH_TMPDIR??tmpdir(),'xero-cash-original-'));
const directory=join(scratch,'accounting'),outboxDir=join(scratch,'outbox'),
  proofDir=join(scratch,'proofs'),termsFile=join(scratch,'terms.json');
let workspace=null,service=null,controller=null,xero=null,client=null,stage='original workspace setup',result=null;
let baselineCycleId,secondCycleId,firstPackageId,secondPackageId,baselineRequest,secondRequest;
const persistResult=async value=>{
  const text=json(value);
  if(process.env.SCF_CASH_RESULT)await writeFile(resolve(process.env.SCF_CASH_RESULT),text,{mode:0o600});
  process.stdout.write(text);
};
try {
  await mkdir(outboxDir,{mode:0o700});await mkdir(proofDir,{mode:0o700});
  await writeFile(termsFile,json({schema:'stellar-forge.merchant-accounting-terms.v1',routes:[{
    routeId:'cash-cycle-check',method:'GET',network:'stellar:testnet',
    asset:sourceStrKey(16,1),payTo:sourceStrKey(48,2),amountAtomic:'1000000',
    unitPriceUsd:'1',unitCostUsd:null,priceBasis:'Original private customer cash workflow'
  }]}),{mode:0o600});
  async function openOriginal() {
    workspace=await openAccountingWorkspace({directory,outboxDir,proofDir,termsFile});
    service=await createXeroReceivablesServer({workspace,port:0,includeReceivables:false,includeCustomerStatements:false});
    controller=service.receivables;xero=service.controller;
    client=new XeroReceivablesClient({baseUrl:new URL('/api/receivables/xero',service.url).href});
  }
  await openOriginal();
  const op=value=>({revision:workspace.state.revision,actor,requestId:randomUUID(),...value});
  const customer=(await controller.saveCustomer({revision:workspace.state.revision,actor,
    reference:'CASH-ORIGINAL',name:'Original cash commissioning customer',email:'',address:'',note:''})).customer;
  identities.customerId=customer.id;
  await controller.settings(op({name:'Original customer cash merchant',invoicePrefix:'CSH',creditPrefix:'CCR'}));
  async function issue(amount,issueDate) {
    const saved=await controller.saveDraft(op({customerId:customer.id,currency,issueDate,dueDate:day(30),
      lines:[{id:'service',description:'Implementation service',quantity:'1',unitAmount:amount}]}));
    const reviewed=await controller.preview(saved.invoice.id);
    const row=(await controller.issue(saved.invoice.id,op({
      expectedVersion:reviewed.expectedVersion,previewSha256:reviewed.previewSha256}))).invoice;
    invoiceHashes[row.id]=sha((await controller.file(row.id,'invoice.json')).bytes);
    return controller._invoice(row.id);
  }
  const a=await issue('100.00',day(-10)),p=await issue('30.00',day(-10)),o=await issue('20.00',day(-10));
  const receipt=async(amount,reference)=>(await controller.receipt(op({
    customerId:customer.id,currency,amount,receivedDate:day(-9),method:'Bank transfer',reference}))).receipt;
  const aReceipt=await receipt('100.00','AGGREGATE-A-100'),
    pReceipt=await receipt('50.00','PREPAID-CUSTOMER-50'),oReceipt=await receipt('25.00','OVERPAID-CUSTOMER-25');
  const allocate=async(invoiceId,receiptId,amount,date)=>(await controller.allocate(op({
    invoiceId,receiptId,amount,allocatedDate:date}))).allocation;
  const aAllocation=await allocate(a.id,aReceipt.id,'100.00',day(-9)),
    pAllocation=await allocate(p.id,pReceipt.id,'30.00',day(-9)),
    oAllocation=await allocate(o.id,oReceipt.id,'20.00',day(-9));
  Object.assign(identities,{invoiceA:a.id,prepaidInvoice:p.id,overpaidInvoice:o.id,
    receiptA:aReceipt.id,prepaidReceipt:pReceipt.id,overpaidReceipt:oReceipt.id});
  stage='original bank source coverage';
  const csvLayout={delimiter:';',dateFormat:'YYYY-MM-DD',decimalMark:'.',groupSeparator:'',
    amountMode:'SIGNED',creditSign:'POSITIVE',columns:{
      date:'Booked',amount:'Amount',transactionId:'Bank ID',reference:'Reference',counterparty:'Counterparty',invoiceReference:'Invoice'}};
  const bankAccount=(await controller.saveBankAccount(op({reference:'CASH-USD',name:'Original operating bank account',
    currency,bankId:'CASH-CHECK',accountReference:'CASH-001',method:'Bank transfer',csvLayout}))).bankAccount;
  const csv='\uFEFFBooked;Amount;Bank ID;Reference;Counterparty;Invoice\n'+
    day(-9)+';40.00;CASH-A-40;AGGREGATE-A-100;Original cash commissioning customer;\n'+
    day(-9)+';60.00;CASH-A-60;AGGREGATE-A-100;Original cash commissioning customer;\n';
  const bankImport=(await controller.importBankSource(op({accountId:bankAccount.id,format:'CSV',
    file:upload('original-bank-credit-coverage.csv',csv),csvLayout}))).bankImport;
  const bankRows=(await controller.bankImport(bankImport.id,{view:'rows',limit:500})).items;
  assert.equal(bankRows.length,2);
  const bankPreview=await controller.previewBankPosting(bankImport.id,{selections:bankRows.map(row=>({
    rowId:row.id,splits:[{action:'LINK',receiptId:aReceipt.id,amount:row.amount,allocations:[]}]}))});
  await controller.postBankReceipts(bankImport.id,op({proposal:bankPreview.proposal,reviewSha256:bankPreview.reviewSha256}));
  assert.equal(controller._receipt(aReceipt.id).bankSources.length,2);
  assert.equal(receiptSummary(controller._receipt(aReceipt.id),controller.data(),day(-3)).allocated,'100.00');
  sourceHashes.originalBank=sha((await controller.bankImportFile(bankImport.id,'source.csv')).bytes);
  assert.equal(sourceHashes.originalBank,sha(Buffer.from(csv)));
  outcomes.push('Two exact bank credits cover the original aggregate receipt without creating additional customer cash.');

  stage='original Xero document handover';
  const headers=['*ContactName','EmailAddress','*InvoiceNumber','Reference','*InvoiceDate','*DueDate',
    '*Description','*Quantity','*UnitAmount','Discount','*AccountCode','*TaxType','Currency','BrandingTheme'];
  const template=Buffer.from('\uFEFF'+headers.join(',')+'\r\n');
  const profile=(await client.saveProfile(op({name:'Original cash commissioning USD',
    organisation:'Private original Xero organisation',currency,
    invoiceDateFormat:'MM/DD/YYYY',creditDateFormat:'DD/MM/YYYY',accountCode:'200',taxType:'Tax on Sales',
    contacts:[{customerId:customer.id,contactName:customer.name}],lineMappings:[],
    invoiceTemplate:upload('original-invoice-template.csv',template),
    creditTemplate:upload('original-credit-template.csv',template)}))).profile;
  async function packageFor(documentIds,date,title) {
    const selection={profileId:profile.id,documentIds,asOf:date},preview=await client.preview(selection);
    assert.equal(preview.ready,true,json(preview));
    return (await client.prepare(op({...selection,previewSha256:preview.previewSha256,title}))).package;
  }
  const package1=await packageFor([a.id,p.id,o.id],day(-3),'First original customer billing cycle');
  firstPackageId=package1.id;
  const ids={a:randomUUID(),p:randomUUID(),o:randomUUID(),b:randomUUID(),credit:randomUUID(),
    payment:randomUUID(),prepayment:randomUUID(),overpayment:randomUUID(),
    prepaidAllocation:randomUUID(),overpaidAllocation:randomUUID(),nextPrepaidAllocation:randomUUID(),
    creditAllocation:randomUUID(),refund:randomUUID(),bank:randomUUID()};
  const invoiceRecord=(invoice,id,{paid=0,credited=0,due=0,payments=[],credits=[],prepayments=[],overpayments=[]}={})=>({
    Type:'ACCREC',InvoiceID:id,InvoiceNumber:invoice.number,Status:'AUTHORISED',CurrencyCode:currency.code,
    SubTotal:Number(invoice.document.totals.net),TotalTax:Number(invoice.document.totals.tax),Total:Number(invoice.document.totals.total),
    DateString:invoice.document.issueDate+'T00:00:00',DueDateString:invoice.document.dueDate+'T00:00:00',
    Contact:{Name:customer.name},LineItems:invoice.document.lines.map(line=>({
      Description:line.description,Quantity:Number(line.quantity),UnitAmount:Number(line.unitAmount),
      LineAmount:Number(line.netAmount),TaxAmount:Number(line.taxAmount)})),
    AmountPaid:paid,AmountCredited:credited,AmountDue:due,Payments:payments,
    CreditNotes:credits,Prepayments:prepayments,Overpayments:overpayments
  });
  const application=(id,invoiceId,amount,date)=>({
    AllocationID:id,Invoice:{InvoiceID:invoiceId},Amount:amount,Date:msdate(date),IsDeleted:false
  });
  const basePayment=reconciled=>({
    PaymentID:ids.payment,Invoice:{InvoiceID:ids.a,Type:'ACCREC',CurrencyCode:'USD'},
    Amount:100,Date:msdate(day(-9)),DateString:day(-9)+'T00:00:00',
    PaymentType:'ACCRECPAYMENT',Status:'AUTHORISED',IsReconciled:reconciled,
    BankAmount:90,CurrencyRate:0.9,Account:{AccountID:ids.bank,Code:'090',CurrencyCode:'EUR'},
    Reference:'Original bank settlement in a different account currency'
  });
  const prepaidHeader=(allocations,remaining)=>({
    PrepaymentID:ids.prepayment,Type:'RECEIVE-PREPAYMENT',Status:'AUTHORISED',CurrencyCode:'USD',
    Contact:{Name:customer.name},Date:msdate(day(-9)),Total:50,RemainingCredit:remaining,
    Allocations:allocations,Payments:[]
  });
  const overpaidHeader=(payments,remaining)=>({
    OverpaymentID:ids.overpayment,Type:'RECEIVE-OVERPAYMENT',Status:'AUTHORISED',CurrencyCode:'USD',
    Contact:{Name:customer.name},Date:msdate(day(-9)),Total:25,RemainingCredit:remaining,
    Allocations:[application(ids.overpaidAllocation,ids.o,20,day(-9))],Payments:payments
  });
  const applied=(kind,id,amount)=>({
    [kind==='PREPAYMENT'?'PrepaymentID':kind==='OVERPAYMENT'?'OverpaymentID':'CreditNoteID']:id,
    AppliedAmount:amount
  });
  const envelope=(date,values)=>({
    Id:randomUUID(),Status:'OK',ProviderName:'Original private source workflow',DateTimeUTC:msdate(date),...values
  });
  const provider1=envelope(day(-3),{
    Invoices:[
      invoiceRecord(a,ids.a,{paid:100,payments:[basePayment(false)]}),
      invoiceRecord(p,ids.p,{credited:30,prepayments:[applied('PREPAYMENT',ids.prepayment,30)]}),
      invoiceRecord(o,ids.o,{credited:20,overpayments:[applied('OVERPAYMENT',ids.overpayment,20)]})
    ],CreditNotes:[],Prepayments:[prepaidHeader([application(ids.prepaidAllocation,ids.p,30,day(-9))],20)],
    Overpayments:[overpaidHeader([],5)],Payments:[basePayment(false)]
  });
  const provider1Bytes=Buffer.from(json(provider1).replaceAll('"BankAmount": 90','"BankAmount": 9e1'));
  const receiving1=await client.receive(package1.id,op({organisation:profile.organisation,format:'NATIVE_JSON',
    file:upload('cycle-1-original-xero.json',provider1Bytes),receivedAt:observed(-3)}));
  const import1=receiving1.operation.result.importId;
  assert.equal(receiving1.package.resolutions.length,3);
  assert.ok(receiving1.package.resolutions.every(row=>row.imported===true&&row.status==='IMPORTED'),json(receiving1.package.resolutions));
  sourceHashes.provider1=sha(provider1Bytes);
  identities.firstImportId=import1;


  const cashStateSha=()=>{
    const data=controller.data();return sha(json(Object.fromEntries(
      ['invoices','credits','receipts','allocations','refunds','creditDispositions'].map(key=>[key,data[key]??[]]))));
  };
  const body=async response=>Buffer.from(await response.arrayBuffer());
  const readCash=async(packageId,cycleId,name)=>body(await client.cashFile(packageId,cycleId,name));
  const entry=(review,kind,externalId,documentId)=>review.entries.find(row=>
    row.kind===kind&&row.externalId===externalId&&(documentId===undefined||row.documentId===documentId));
  const document=(review,id)=>review.documents.find(row=>row.documentId===id);
  const matchedInput=(review,kind,externalId,documentId,native,reason='')=>{
    const row=entry(review,kind,externalId,documentId);
    assert.ok(row,'Expected original source entry '+kind+'/'+externalId);
    for(const part of native)assert.ok(row.candidateKeys.includes(part.kind+'/'+part.id),
      'Native candidate '+part.kind+'/'+part.id+' for '+row.key);
    return {entryKey:row.key,native,...(reason?{dateDifferenceReason:reason}:{})};
  };
  const matchAllocation=(id,amount)=>({kind:'ALLOCATION',id,amount});
  const assertReviewSeal=review=>{
    const sealed=copy(review);delete sealed.previewSha256;delete sealed.files;
    assert.equal(review.previewSha256,sha(json(sealed)));
  };
  stage='first billing cycle source review and saved matching';
  const selection1={packageIds:[package1.id],asOf:day(-3),label:'First original customer cash cycle',
    importIds:[import1],sourceBindings:[
      {kind:'PREPAYMENT',externalId:ids.prepayment,customerId:customer.id},
      {kind:'OVERPAYMENT',externalId:ids.overpayment,customerId:customer.id}
    ],matches:[]};
  const firstOpen=await client.cashPreview(package1.id,selection1);
  assert.equal(firstOpen.entries.length,3);
  assert.equal(entry(firstOpen,'PAYMENT',ids.payment).amount,'100.00');
  assert.equal(entry(firstOpen,'PAYMENT',ids.payment).bankAmount,'9e1');
  assert.equal(entry(firstOpen,'PAYMENT',ids.payment).bankCurrencyCode,'EUR');
  assert.equal(entry(firstOpen,'PAYMENT',ids.payment).isReconciled,false);
  assert.equal(entry(firstOpen,'PAYMENT',ids.payment).bankAmountEvidence.observations[0].field.sourceType,'number');
  assert.equal(document(firstOpen,p.id).provider.amountPaid,'0.00');
  assert.equal(document(firstOpen,p.id).provider.amountCredited,'30.00');
  assert.equal(document(firstOpen,p.id).provider.prepaymentApplied,'30.00');
  assert.equal(document(firstOpen,p.id).provider.creditNotesApplied,'0.00');
  assert.equal(document(firstOpen,o.id).provider.overpaymentApplied,'20.00');
  assert.equal(firstOpen.receiptLineage[aReceipt.id].bankSources.length,2);
  assert.equal(firstOpen.cashSources.find(row=>row.externalId===ids.prepayment).remainingCredit,'20.00');
  assert.equal(firstOpen.cashSources.find(row=>row.externalId===ids.overpayment).remainingCredit,'5.00');
  selection1.matches=[
    matchedInput(firstOpen,'PAYMENT',ids.payment,a.id,[matchAllocation(aAllocation.id,'100.00')]),
    matchedInput(firstOpen,'PREPAYMENT_APPLICATION',ids.prepayment,p.id,[matchAllocation(pAllocation.id,'30.00')]),
    matchedInput(firstOpen,'OVERPAYMENT_APPLICATION',ids.overpayment,o.id,[matchAllocation(oAllocation.id,'20.00')])
  ];
  const baselinePreview=await client.cashPreview(package1.id,selection1);
  assert.equal(baselinePreview.status,'MATCHED',json(baselinePreview.findings));
  assert.equal(baselinePreview.counts.matchedEntries,3);assertReviewSeal(baselinePreview);
  const originalCashBeforeCapture=cashStateSha();
  baselineRequest=xeroCashCaptureArguments(selection1,baselinePreview,{actor,requestId:randomUUID()});
  const baselineSaved=await client.cashCapture(package1.id,baselineRequest);
  baselineCycleId=baselineSaved.cashCycle.id;
  assert.equal(baselineSaved.cashCycle.status,'MATCHED');
  assert.equal(cashStateSha(),originalCashBeforeCapture);
  const baselineReplay=await client.cashCapture(package1.id,baselineRequest);
  assert.equal(baselineReplay.operation.replayed,true);
  assert.equal(baselineReplay.cashCycle.id,baselineCycleId);
  assert.equal((await client.cashCycles(package1.id)).items.length,1);
  const baselineBytes=await readCash(package1.id,baselineCycleId,'cash-review.json');
  sourceHashes.baselineReview=sha(baselineBytes);
  assert.equal(JSON.parse(baselineBytes).previewSha256,baselinePreview.previewSha256);
  sourceHashes.baselineSnapshot=sha(await readCash(package1.id,baselineCycleId,'cash-account-snapshot.json'));
  assert.equal(sha(await readCash(package1.id,baselineCycleId,'cash-source-'+sourceHashes.provider1+'.json')),sourceHashes.provider1);
  outcomes.push('The first saved cycle matches direct payments and applied prepaid/overpaid cash, preserving exact source numbers, bank currency and the independent reconciliation flag.');

  stage='second billing cycle and original paid-credit disposition';
  const nextInvoice=await issue('20.00',day(-1));
  const creditResult=await controller.credit(a.id,op({creditDate:day(-1),reason:'Credit carried to the next original billing cycle',
    lines:[{invoiceLineId:'service',netAmount:'10.00'}]}));
  const credit=controller.data().credits.find(row=>row.id===creditResult.operation.result.creditId);
  assert.ok(credit);assert.equal(credit.document.totals.total,'10.00');
  const dispositionPreview=await controller.previewCreditDisposition({
    receiptId:aReceipt.id,effectiveDate:day(-1),reason:'Use the original paid-invoice credit for the next invoice',
    funding:[{allocationId:aAllocation.id,amount:'10.00'}],
    allocations:[{invoiceId:nextInvoice.id,amount:'10.00'}]
  });
  const disposition=await controller.applyCreditDisposition(op({
    proposal:dispositionPreview.proposal,reviewSha256:dispositionPreview.reviewSha256}));
  const dispositionId=disposition.creditDisposition.id;
  const allocationAfter=controller.data().allocations.find(row=>row.replacesAllocationId===aAllocation.id&&row.invoiceId===a.id);
  const targetAllocation=controller.data().allocations.find(row=>row.dispositionId===dispositionId&&row.invoiceId===nextInvoice.id);
  assert.ok(allocationAfter&&targetAllocation);
  assert.equal(allocationAfter.amount,'90.00');assert.equal(targetAllocation.amount,'10.00');
  const nextPrepaid=await allocate(nextInvoice.id,pReceipt.id,'10.00',day(-1));
  const refundPreview=await controller.previewRefund({receiptId:oReceipt.id,amount:'2.00',effectiveDate:day(-1),
    reason:'Return two dollars of the original unapplied overpayment',funding:[],
    payout:{kind:'OPERATOR_RECORDED',method:'Bank transfer',reference:'OVERPAYMENT-REFUND-2',refundDate:day(-1)}});
  const refund=(await controller.commitRefund(op({proposal:refundPreview.proposal,reviewSha256:refundPreview.reviewSha256}))).refund;
  Object.assign(identities,{nextInvoiceId:nextInvoice.id,creditId:credit.id,dispositionId,refundId:refund.id});
  const currentA=invoiceSummary(controller._invoice(a.id),controller.data(),asOf);
  assert.equal(currentA.paid,'90.00');assert.equal(currentA.credited,'10.00');assert.equal(currentA.amountDue,'0.00');
  assert.equal(invoiceSummary(controller._invoice(nextInvoice.id),controller.data(),asOf).paid,'20.00');
  assert.equal(receiptSummary(controller._receipt(pReceipt.id),controller.data(),asOf).available,'10.00');
  assert.equal(receiptSummary(controller._receipt(oReceipt.id),controller.data(),asOf).refunded,'2.00');
  assert.equal(receiptSummary(controller._receipt(oReceipt.id),controller.data(),asOf).available,'3.00');
  assert.equal(invoiceSummary(controller._invoice(a.id),controller.data(),day(-3)).paid,'100.00');
  assert.equal(invoiceSummary(controller._invoice(a.id),controller.data(),day(-3)).credited,'0.00');
  const package2=await packageFor([nextInvoice.id,credit.id],asOf,'Second original customer billing cycle');
  secondPackageId=package2.id;
  const nativePackage2=JSON.parse(await body(await client.file(package2.id,'original-account-snapshot.json')));
  assert.ok(nativePackage2.refunds.some(row=>row.id===refund.id));
  assert.ok(nativePackage2.creditDispositions.some(row=>row.id===dispositionId));
  const cashAdvice=JSON.parse(await body(await client.file(package2.id,'customer-cash-files.json')));
  assert.match(json(cashAdvice),/documents\/(?:bank-|refund-|credit-disposition-)/);
  const providerRefund={
    PaymentID:ids.refund,Overpayment:{OverpaymentID:ids.overpayment,CurrencyCode:'USD'},
    Amount:2,Date:msdate(day(-1)),DateString:day(-1)+'T00:00:00',
    PaymentType:'AROVERPAYMENTPAYMENT',Status:'AUTHORISED',IsReconciled:true,
    BankAmount:2,Account:{AccountID:ids.bank,Code:'090',CurrencyCode:'USD'},Reference:'OVERPAYMENT-REFUND-2'
  };
  const creditSource={
    Type:'ACCRECCREDIT',CreditNoteID:ids.credit,CreditNoteNumber:credit.number,Status:'AUTHORISED',
    CurrencyCode:'USD',SubTotal:10,TotalTax:0,Total:10,RemainingCredit:0,
    DateString:day(-1)+'T00:00:00',Contact:{Name:customer.name},
    LineItems:[{Description:'Credit carried to the next original billing cycle',Quantity:1,UnitAmount:10,LineAmount:10,TaxAmount:0}],
    Allocations:[application(ids.creditAllocation,ids.b,10,day(-1))],Payments:[]
  };
  const provider2=envelope(asOf,{
    Invoices:[
      invoiceRecord(controller._invoice(a.id),ids.a,{paid:100,payments:[basePayment(true)]}),
      invoiceRecord(controller._invoice(p.id),ids.p,{credited:30,prepayments:[applied('PREPAYMENT',ids.prepayment,30)]}),
      invoiceRecord(controller._invoice(o.id),ids.o,{credited:20,overpayments:[applied('OVERPAYMENT',ids.overpayment,20)]}),
      invoiceRecord(nextInvoice,ids.b,{credited:20,credits:[applied('CREDIT_NOTE',ids.credit,10)],
        prepayments:[applied('PREPAYMENT',ids.prepayment,10)]})
    ],CreditNotes:[creditSource],
    Prepayments:[prepaidHeader([application(ids.prepaidAllocation,ids.p,30,day(-9)),
      application(ids.nextPrepaidAllocation,ids.b,10,day(-1))],10)],
    Overpayments:[overpaidHeader([providerRefund],3)],Payments:[basePayment(true),providerRefund]
  });
  const provider2Bytes=Buffer.from(json(provider2).replaceAll('"BankAmount": 90','"BankAmount": 9e1'));
  const receiving2=await client.receive(package2.id,op({organisation:profile.organisation,format:'NATIVE_JSON',
    file:upload('cycle-2-original-xero.json',provider2Bytes),receivedAt:observed(0,'00:10:00.000')}));
  const import2=receiving2.operation.result.importId;
  assert.equal(receiving2.package.resolutions.length,2);
  assert.ok(receiving2.package.resolutions.every(row=>row.imported===true&&row.status==='IMPORTED'),json(receiving2.package.resolutions));
  sourceHashes.provider2=sha(provider2Bytes);identities.secondImportId=import2;
  outcomes.push('The next billing cycle preserves historical cash, moves an exact original paid credit to the new invoice, and records the actual two-dollar overpayment refund.');


  stage='second-cycle original cash representation';
  const selection2={packageIds:[package1.id,package2.id],asOf,label:'Second original customer cash cycle',
    baselineCycleId,importIds:[import1,import2],sourceBindings:copy(selection1.sourceBindings),matches:[]};
  const secondOpen=await client.cashPreview(package2.id,selection2);
  const released=secondOpen.nativeRows.find(row=>row.id===aAllocation.id&&row.accountingRole==='DISPOSITION_FUNDING');
  assert.ok(released);assert.equal(released.kind,'ALLOCATION');
  assert.equal(released.amount,'10.00');assert.equal(released.originalAmount,'100.00');
  assert.ok(released.fundingGroups.some(row=>row.ownerId===dispositionId));
  assert.ok(secondOpen.nativeRows.find(row=>row.id===targetAllocation.id).dispositionAssociations
    .some(row=>row.dispositionId===dispositionId&&row.sourceInvoiceId===a.id));
  selection2.matches=[
    matchedInput(secondOpen,'PAYMENT',ids.payment,a.id,[
      matchAllocation(allocationAfter.id,'90.00'),matchAllocation(aAllocation.id,'10.00')],
      'The original payment occurred before the paid-invoice credit. Its retained and released portions share the exact original disposition.'),
    matchedInput(secondOpen,'PREPAYMENT_APPLICATION',ids.prepayment,p.id,[matchAllocation(pAllocation.id,'30.00')]),
    matchedInput(secondOpen,'OVERPAYMENT_APPLICATION',ids.overpayment,o.id,[matchAllocation(oAllocation.id,'20.00')]),
    matchedInput(secondOpen,'CREDIT_APPLICATION',ids.credit,nextInvoice.id,[matchAllocation(targetAllocation.id,'10.00')]),
    matchedInput(secondOpen,'PREPAYMENT_APPLICATION',ids.prepayment,nextInvoice.id,[matchAllocation(nextPrepaid.id,'10.00')]),
    matchedInput(secondOpen,'REFUND',ids.refund,undefined,[{kind:'REFUND',id:refund.id,amount:'2.00'}])
  ];
  const secondPreview=await client.cashPreview(package2.id,selection2);
  assert.equal(secondPreview.status,'MATCHED',json(secondPreview.findings));
  assert.equal(secondPreview.counts.matchedEntries,6);assertReviewSeal(secondPreview);
  const comparedA=document(secondPreview,a.id),comparedB=document(secondPreview,nextInvoice.id);
  assert.equal(comparedA.native.paid,'90.00');assert.equal(comparedA.native.credited,'10.00');
  assert.equal(comparedA.comparison.paid,'100.00');assert.equal(comparedA.comparison.credited,'0.00');
  assert.equal(comparedA.provider.directPayments,'100.00');
  assert.equal(comparedB.native.paid,'20.00');assert.equal(comparedB.native.credited,'0.00');
  assert.equal(comparedB.comparison.paid,'10.00');assert.equal(comparedB.comparison.credited,'10.00');
  assert.equal(comparedB.provider.amountPaid,'0.00');
  assert.equal(comparedB.provider.prepaymentApplied,'10.00');
  assert.equal(comparedB.provider.creditNotesApplied,'10.00');
  assert.equal(comparedB.provider.amountDue,'0.00');
  assert.equal(secondPreview.representationBridges.length,1);
  assert.equal(secondPreview.representationBridges[0].dispositionId,dispositionId);
  assert.equal(secondPreview.representationBridges[0].creditId,credit.id);
  assert.equal(secondPreview.representationBridges[0].targetAllocationId,targetAllocation.id);
  assert.equal(secondPreview.nativeRows.find(row=>row.id===credit.id).matchedAmount,'10.00');
  assert.equal(secondPreview.nativeRows.find(row=>row.id===targetAllocation.id).matchedAmount,'10.00');
  assert.equal(secondPreview.nativeRows.find(row=>row.id===aAllocation.id).remainingAmount,'0.00');
  assert.equal(entry(secondPreview,'PAYMENT',ids.payment).isReconciled,true);
  assert.equal(entry(secondPreview,'PAYMENT',ids.payment).bankAmount,'9e1');
  assert.equal(secondPreview.cashSources.find(row=>row.externalId===ids.prepayment).remainingCredit,'10.00');
  assert.equal(secondPreview.cashSources.find(row=>row.externalId===ids.overpayment).remainingCredit,'3.00');
  assert.equal(secondPreview.baseline.cycleId,baselineCycleId);
  assert.ok(secondPreview.changes.some(row=>row.kind==='DOCUMENT_ADDED'&&row.key===nextInvoice.id));
  assert.ok(secondPreview.changes.some(row=>row.kind==='DOCUMENT_CHANGED'&&row.key===a.id));
  assert.ok(secondPreview.changes.some(row=>row.kind==='CASH_ENTRY_CHANGED'&&row.key==='PAYMENT/'+ids.payment&&
    row.before.isReconciled===false&&row.after.isReconciled===true));
  assert.equal(sha(await readCash(package1.id,baselineCycleId,'cash-review.json')),sourceHashes.baselineReview);
  assert.equal(sha(await readCash(package1.id,baselineCycleId,'cash-account-snapshot.json')),sourceHashes.baselineSnapshot);
  outcomes.push('The reviewed A-to-B credit representation consumes the original credit, target allocation and released cash once, while preserving the native invoice amounts and the saved baseline.');

  stage='original incomplete response and shared-capacity correction';
  const economicBeforeProbes=cashStateSha();
  const inconsistentRemainder=copy(provider2);inconsistentRemainder.Overpayments[0].RemainingCredit=4;
  const remainderReview=await client.cashPreview(package2.id,{...selection2,additionalSources:[{
    file:upload('original-source-remainder-difference.json',json(inconsistentRemainder)),observedAt:observed(0,'00:15:00.000')
  }]});
  assert.ok(remainderReview.findings.some(row=>row.code==='XERO_CASH_SOURCE_BALANCE_DIFFERENCE'&&
    row.externalId===ids.overpayment&&row.difference==='1.00'));
  assert.notEqual(remainderReview.status,'MATCHED');
  const incomplete=copy(provider2);
  delete incomplete.Invoices[3].AmountPaid;delete incomplete.Invoices[3].Prepayments;
  const incompleteSelection={...selection2,additionalSources:[{
    file:upload('original-incomplete-invoice-response.json',json(incomplete)),observedAt:observed(0,'00:20:00.000')
  }]};
  const missing=await client.cashPreview(package2.id,incompleteSelection),missingB=document(missing,nextInvoice.id);
  assert.equal(missingB.provider.fields.AmountPaid.present,false);
  assert.equal(missingB.provider.amountPaid,null);
  assert.equal(missingB.provider.collections.prepayments.present,false);
  assert.notEqual(missing.status,'MATCHED');
  assert.ok(missing.findings.some(row=>row.code==='XERO_INVOICE_CASH_FIELDS_MISSING'&&row.documentId===nextInvoice.id));
  const emptyPayments=copy(provider2);emptyPayments.Invoices[0].Payments=[];emptyPayments.Payments=[providerRefund];
  const componentReview=await client.cashPreview(package2.id,{...selection2,additionalSources:[{
    file:upload('original-invoice-without-payment-components.json',json(emptyPayments)),observedAt:observed(0,'00:30:00.000')
  }]});
  assert.equal(document(componentReview,a.id).provider.amountPaid,'100.00');
  assert.equal(document(componentReview,a.id).provider.paymentComponents.amount,'0.00');
  assert.ok(componentReview.findings.some(row=>row.code==='XERO_PAYMENT_COMPONENT_DIFFERENCE'&&row.documentId===a.id));
  assert.equal(document(componentReview,a.id).status,'DIFFERENCES');
  const competing=copy(provider2),duplicate=copy(basePayment(true));duplicate.PaymentID=randomUUID();
  competing.Invoices[0].Payments.push(duplicate);competing.Payments.push(duplicate);
  const duplicateKey='PAYMENT/'+duplicate.PaymentID;
  const repeatedSource=await client.cashPreview(package2.id,{...selection2,
    additionalSources:[{file:upload('original-competing-payment-response.json',json(competing)),
      observedAt:observed(0,'00:40:00.000')}],
    matches:[...selection2.matches,{...copy(selection2.matches[0]),entryKey:duplicateKey}]
  });
  assert.ok(repeatedSource.findings.some(row=>row.code==='CASH_MATCH_CAPACITY'));
  assert.equal(entry(repeatedSource,'PAYMENT',ids.payment).status,'MATCH_REVIEW_REQUIRED');
  assert.equal(entry(repeatedSource,'PAYMENT',duplicate.PaymentID).status,'MATCH_REVIEW_REQUIRED');
  assert.equal(cashStateSha(),economicBeforeProbes);
  assert.equal((await client.cashCycles(package2.id)).items.length,0);
  outcomes.push('Original source remainder differences remain actionable, incomplete fields remain missing, empty payment detail cannot certify a paid invoice, and competing cash matches cannot reuse the original funding capacity.');

  stage='second-cycle capture, recovery and complete customer handover';
  const finalPreview=await client.cashPreview(package2.id,selection2);
  assert.equal(finalPreview.previewSha256,secondPreview.previewSha256);
  const economicBeforeSecond=cashStateSha();
  secondRequest=xeroCashCaptureArguments(selection2,finalPreview,{actor,requestId:randomUUID()});
  const captured2=await client.cashCapture(package2.id,secondRequest);
  secondCycleId=captured2.cashCycle.id;
  assert.equal(captured2.cashCycle.baselineCycleId,baselineCycleId);
  assert.equal(captured2.cashCycle.status,'MATCHED');
  assert.equal(cashStateSha(),economicBeforeSecond);
  const replay2=await client.cashCapture(package2.id,secondRequest);
  assert.equal(replay2.operation.replayed,true);assert.equal(replay2.cashCycle.id,secondCycleId);
  const nativeIntent={...secondRequest,xeroPackageId:package2.id};delete nativeIntent.revision;
  assert.equal(replay2.operation.intentSha256,sha(json({action:'xero_cash_cycle_captured',value:nativeIntent})));
  const cycle2=await client.cashCycle(package2.id,secondCycleId);
  assert.deepEqual(cycle2.cashCycle.selection.packageIds,[package1.id,package2.id]);
  assert.equal(cycle2.cashCycle.review.previewSha256,finalPreview.previewSha256);
  const cycle2Bytes=await readCash(package2.id,secondCycleId,'cash-review.json');
  sourceHashes.secondReview=sha(cycle2Bytes);
  sourceHashes.secondSnapshot=sha(await readCash(package2.id,secondCycleId,'cash-account-snapshot.json'));
  const retainedSourceIndex=JSON.parse(await readCash(package2.id,secondCycleId,'cash-source-index.json'));
  const retainedCustomerIndex=JSON.parse(await readCash(package2.id,secondCycleId,'cash-customer-files.json'));
  assert.ok(retainedSourceIndex.provider.some(row=>row.sha256===sourceHashes.provider1&&row.importId===import1));
  assert.ok(retainedSourceIndex.provider.some(row=>row.sha256===sourceHashes.provider2&&row.importId===import2));
  assert.equal(sha(await readCash(package2.id,secondCycleId,'cash-source-'+sourceHashes.provider1+'.json')),sourceHashes.provider1);
  assert.equal(sha(await readCash(package2.id,secondCycleId,'cash-source-'+sourceHashes.provider2+'.json')),sourceHashes.provider2);
  assert.match(json(retainedCustomerIndex),/documents\/bank-/);
  assert.ok(json(retainedCustomerIndex).includes(refund.id));
  assert.ok(json(retainedCustomerIndex).includes(dispositionId));
  for(const name of ['cash-documents.csv','cash-entries.csv','cash-native-rows.csv','cash-findings.csv',
    'cash-cycle-changes.csv','cash-commissioning.html']) {
    const descriptor=cycle2.cashCycle.files.find(row=>row.name===name);
    assert.ok(descriptor,'Original retained '+name);
    const bytes=await readCash(package2.id,secondCycleId,name);
    assert.equal(sha(bytes),descriptor.sha256);assert.equal(bytes.length,descriptor.bytes);
  }
  const fullExport=await client.cashExport(package2.id,secondCycleId);
  assert.equal(fullExport.id,secondCycleId);
  const archive=await client.cashExportFile(package2.id,secondCycleId);
  assert.match(archive.headers.get('content-type')??'',/application\/x-tar/);
  const archiveBytes=await body(archive);
  assert.ok(archiveBytes.length>1024);assert.equal(archiveBytes.length%512,0);
  assert.ok(archiveBytes.includes(Buffer.from('cash-review.json')));
  assert.ok(archiveBytes.includes(Buffer.from('cash-account-snapshot.json')));
  sourceHashes.secondHandoverTar=sha(archiveBytes);
  const asset=await fetch(new URL('cash-commissioning.mjs',service.url),{redirect:'error'});
  assert.equal(asset.status,200);assert.match(asset.headers.get('content-type')??'',/javascript/);
  const assetBytes=await body(asset);
  assert.equal(sha(assetBytes),sha(await readFile(join(sourceRoot,
    'stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/xero/public/cash-commissioning.mjs'))));
  sourceHashes.browserModule=sha(assetBytes);
  for(const [id,digest] of Object.entries(invoiceHashes))assert.equal(sha((await controller.file(id,'invoice.json')).bytes),digest);
  outcomes.push('The actual HTTP client reads complete saved JSON/CSV/HTML, original source and customer advice, a complete tar handover and the deployed browser module with unchanged bytes.');

  stage='close and reopen original owner';
  const economicBeforeReopen=cashStateSha();
  // Drive the original owner's existing uncertain-commit producer before the same close/reopen.
  // This private fault state leaves the already retained cycle bytes in place.
  const uncertainty={at:new Date().toISOString(),action:'receivables_xero_cash_cycle_captured',
    revision:workspace.state.revision,causeCode:'PRIVATE_RECEIVING_FAULT'};
  workspace.commitUncertainty=copy(uncertainty);
  const originalRecoveryMessage=workspace.uncertainCommitError().message;
  await assert.rejects(client.cashCapture(secondPackageId,secondRequest),error=>{
    assert.equal(error.code,'WORKSPACE_COMMIT_UNKNOWN');assert.equal(error.status,409);
    assert.equal(error.message,originalRecoveryMessage);
    assert.equal(error.outcomeUnknown,true);assert.equal(error.reopenRequired,true);
    assert.deepEqual(error.commitUncertainty,uncertainty);
    return true;
  });
  await service.close();service=null;await workspace.close();workspace=null;
  await openOriginal();
  const reopened1=await client.cashCycle(firstPackageId,baselineCycleId),
    reopened2=await client.cashCycle(secondPackageId,secondCycleId);
  assert.equal(reopened1.cashCycle.status,'MATCHED');assert.equal(reopened2.cashCycle.status,'MATCHED');
  assert.equal(reopened2.cashCycle.baselineCycleId,baselineCycleId);
  assert.equal(sha(await readCash(firstPackageId,baselineCycleId,'cash-review.json')),sourceHashes.baselineReview);
  assert.equal(sha(await readCash(firstPackageId,baselineCycleId,'cash-account-snapshot.json')),sourceHashes.baselineSnapshot);
  assert.equal(sha(await readCash(secondPackageId,secondCycleId,'cash-review.json')),sourceHashes.secondReview);
  assert.equal(sha(await readCash(secondPackageId,secondCycleId,'cash-account-snapshot.json')),sourceHashes.secondSnapshot);
  assert.equal(cashStateSha(),economicBeforeReopen);
  const replayAfterReopen=await client.cashCapture(secondPackageId,secondRequest);
  assert.equal(replayAfterReopen.operation.replayed,true);assert.equal(replayAfterReopen.cashCycle.id,secondCycleId);
  assert.equal((await client.cashCycles(firstPackageId)).items.length,2);
  assert.equal((await client.cashCycles(secondPackageId)).items.length,1);
  assert.equal(invoiceSummary(controller._invoice(a.id),controller.data(),day(-3)).paid,'100.00');
  assert.equal(invoiceSummary(controller._invoice(a.id),controller.data(),asOf).paid,'90.00');
  assert.equal(receiptSummary(controller._receipt(oReceipt.id),controller.data(),asOf).available,'3.00');
  outcomes.push('Original uncertain-commit recovery fields cross the HTTP client; reopening the original owner recovers both immutable cycles and the exact mutation replay while historical and current cash remain conserved.');
  result={schema:'stellar-forge.xero-cash-native-check.v1',status:'PASS',asOf,node:process.version,
    workspaceDirectory:directory,firstPackageId,secondPackageId,baselineCycleId,secondCycleId,
    identities,sourceHashes,invoiceHashes,outcomes,completedAt:new Date().toISOString()};
} catch(error) {
  process.exitCode=1;
  result={schema:'stellar-forge.xero-cash-native-check.v1',status:'FAIL',asOf,node:process.version,stage,
    code:error.code??error.name,message:error.message,details:error.details??null,
    stack:String(error.stack??''),workspaceDirectory:directory,
    firstPackageId,secondPackageId,baselineCycleId,secondCycleId,identities,sourceHashes,outcomes,
    completedAt:new Date().toISOString()};
} finally {
  try{if(service)await service.close();}catch(error){if(result?.status==='PASS'){result.status='FAIL';result.stage='close HTTP service';result.message=error.message;process.exitCode=1;}}
  try{if(workspace)await workspace.close();}catch(error){if(result?.status==='PASS'){result.status='FAIL';result.stage='close original workspace';result.message=error.message;process.exitCode=1;}}
}
await persistResult(result);
if(process.env.SCF_CASH_KEEP!=='1'&&result.status==='PASS')await rm(scratch,{recursive:true,force:true});
