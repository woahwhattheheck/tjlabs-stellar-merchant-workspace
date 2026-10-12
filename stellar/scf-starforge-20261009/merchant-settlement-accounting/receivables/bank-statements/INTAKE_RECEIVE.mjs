// SPDX-License-Identifier: MIT
// Complete receiving across both original bank desks and one original customer ledger.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {ReceivablesClient} from '../client.mjs';
import {receiptCoverageGroups} from '../bank-coverage.mjs';
import {json,sha} from '../core.mjs';

export async function receiveOriginalIntakeAlias({origin,workspace,account,original,received,originalReceipt,actor}) {
  const api=new ReceivablesClient({baseUrl:origin+'/api/receivables'}),
    request=value=>({revision:workspace.state.revision,actor,requestId:randomUUID(),...value}),
    saved=workspace.state.receivables.bankStatements.accounts.find(row=>row.id===account.id);
  assert(saved.receiptIntakeAccountId);
  const source={accountId:saved.receiptIntakeAccountId,format:'OFX',
    file:{name:original.file.name,dataBase64:Buffer.from(original.file.content).toString('base64')}};
  const inspection=await api.inspectBankSource(source);
  assert(!inspection.issues.some(issue=>['BANK_CURRENCY_MISMATCH','BANK_ACCOUNT_MISMATCH','BANK_ID_MISMATCH'].includes(issue.code)),json(inspection.issues));
  const selection=inspection.sections.find(section=>section.accountReference==='operating-001');
  assert(selection,'The original Python intake parser retains the same native OFX account');
  const imported=(await api.importBankSource(request({...source,sectionId:selection.id}))).bankImport;
  const parserReport=await (await api.bankImportFile(imported.id,'parser-report.json')).json();
  const parsedSource=parserReport.sources[0].parsed;
  assert.equal(parsedSource.closing_statements.length,1);
  const closing=parsedSource.closing_statements[0];
  assert.equal(closing.account.ACCTID,'operating-001');assert.equal(closing.currency,'USD');
  assert.equal(closing.closings[0].raw.FITID,'native-closing-oct04');
  assert.equal(closing.closings[0].amounts.BALOPEN,'1000');
  assert.equal(closing.closings[0].amounts.BALCLOSE,'1272');
  assert.equal(closing.closings[0].dates.DTCLOSE.local_date,'2026-10-04');
  assert.equal(parsedSource.statements[0].pending_asof.local_date,'2026-10-04');
  const full=await api.bankImport(imported.id,{view:'rows',limit:500});
  const rows=full.rows.items;
  const net=rows.find(row=>row.transactionId==='B100'),existing=rows.find(row=>row.transactionId==='C200');
  assert(net&&existing);assert.equal(net.amount,'97.00');
  assert.equal(net.statementReconciliation.adjustmentAmount,'-3.00');
  assert(net.receiptCandidates.some(item=>item.receipt.id===received.receipt.id));
  const before=workspace.state.receivables.receipts.length;
  const preview=await api.previewBankPosting(imported.id,{selections:[
    {rowId:net.id,splits:[{action:'LINK',receiptId:received.receipt.id,amount:'100.00'}]},
    {rowId:existing.id,splits:[{action:'LINK',receiptId:originalReceipt.id,amount:'200.00'}]}
  ]});
  assert.equal(preview.balanceEffects.totals.sourceCredits,'297.00');
  assert.equal(preview.balanceEffects.totals.linkedReceiptAmount,'300.00');
  assert.equal(preview.balanceEffects.totals.statementAdjustmentAmount,'-3.00');
  const posting=await api.postBankReceipts(imported.id,request({proposal:preview.proposal,reviewSha256:preview.reviewSha256}));
  assert.equal(workspace.state.receivables.receipts.length,before);
  for(const id of [received.receipt.id,originalReceipt.id]) {
    const receipt=workspace.state.receivables.receipts.find(row=>row.id===id),coverage=receiptCoverageGroups(receipt);
    assert.equal(coverage.groups.size,1);assert.equal(coverage.groups.values().next().value.links.length,2);
  }
  const retained=Buffer.from(await (await api.bankImportFile(imported.id,'source.ofx')).arrayBuffer());
  assert.deepEqual(retained,Buffer.from(original.file.content));
  return {name:'original OFX through both maintained parsers and shared gross receipt coverage',
    intakeAccountId:saved.receiptIntakeAccountId,intakeImportId:imported.id,postingId:posting.bankPosting.id,
    sourceCredits:'297.00',linkedOriginalReceipts:'300.00',retainedBankAdjustments:'-3.00',
    customerReceiptCount:before,sourceBytes:retained.length,sourceSha256:sha(retained)};
}

export async function receivePartialIntake({origin,workspace,client,receivables,workspaceId,outputDir,actor}) {
  const currency={code:'USD',scale:2},api=new ReceivablesClient({baseUrl:origin+'/api/receivables'}),
    request=value=>({revision:workspace.state.revision,actor,requestId:randomUUID(),...value}),
    bound=value=>request({workspaceId,...value});
  const customer=(await receivables.saveCustomer(request({reference:'COVERAGE-CUSTOMER',name:'Original partial payment customer',email:'',address:'',note:''}))).customer;
  const draft=(await api.saveDraft(request({customerId:customer.id,currency,issueDate:'2026-09-01',dueDate:'2026-09-30',
    lines:[{id:'service',description:'Original customer service',quantity:'1',unitAmount:'150.00',taxAmount:'0.00'}],note:''}))).invoice;
  const invoiceReview=await api.preview(draft.id);
  await api.issue(draft.id,request({expectedVersion:invoiceReview.expectedVersion,previewSha256:invoiceReview.previewSha256}));
  const originalReceipt=(await api.receipt(request({customerId:customer.id,currency,amount:'150.00',receivedDate:'2026-09-01',
    method:'Bank transfer',reference:'AGGREGATE150',note:'Three actual credits cover this original aggregate receipt'}))).receipt;
  await api.allocate(request({invoiceId:draft.id,receiptId:originalReceipt.id,amount:'150.00',allocatedDate:'2026-09-01'}));
  const intake=(await api.saveBankAccount(request({reference:'PARTIAL-OPERATING',name:'Partial payments bank',currency,
    bankId:'NATIVE-RECEIVING-BANK',accountReference:'coverage-002',method:'Bank transfer'}))).bankAccount;
  const originalCsv='Date,Amount,ID,Reference,Payee\n2026-09-04,60.00,P60,COVERAGE-CUSTOMER,Original partial payment customer\n'+
    '2026-09-05,40.00,P40,COVERAGE-CUSTOMER,Original partial payment customer\n'+
    '2026-09-06,50.00,P50,COVERAGE-CUSTOMER,Original partial payment customer\n';
  const csvLayout={delimiter:',',dateFormat:'YYYY-MM-DD',decimalMark:'.',groupSeparator:'',
    amountMode:'SIGNED',creditSign:'POSITIVE',columns:{date:'Date',amount:'Amount',transactionId:'ID',reference:'Reference',counterparty:'Payee'}};
  const intakeSource=(content,name)=>({accountId:intake.id,format:'CSV',file:{name,dataBase64:Buffer.from(content).toString('base64')},csvLayout});
  const imported=(await api.importBankSource(request(intakeSource(originalCsv,'Original three bank credits.csv')))).bankImport;
  const originalRows=(await api.bankImport(imported.id,{view:'rows',limit:500})).rows.items;
  const aliasSelection=ids=>({selections:ids.map(id=>{
    const row=originalRows.find(row=>row.transactionId===id);
    return {rowId:row.id,splits:[{action:'LINK',receiptId:originalReceipt.id,amount:row.amount,
      dateDifferenceReason:'Original aggregate receipt date precedes these individually retained bank credits'}]};
  })});
  const first=await api.previewBankPosting(imported.id,aliasSelection(['P60','P40']));
  await api.postBankReceipts(imported.id,request({proposal:first.proposal,reviewSha256:first.reviewSha256}));
  assert.equal(receiptCoverageGroups(workspace.state.receivables.receipts.find(row=>row.id===originalReceipt.id)).total,10000n);

  const rootSource=(content,name)=>({format:'CSV',file:{name,content,encoding:'utf8'},csv:{
    delimiter:',',headerRow:1,dateFormat:'YMD',decimalSeparator:'.',groupSeparator:',',amountMode:'SIGNED',
    account:{kind:'BANK',bankId:'NATIVE-RECEIVING-BANK',accountId:'coverage-002',accountType:'CHECKING',currency:'USD'},
    columns:{postedDate:'Date',amount:'Amount',providerId:'ID',reference:'Reference',payee:'Payee'}}});
  const statementSource=rootSource(originalCsv,'Original three bank credits.csv'),preview=await client.previewSource({source:statementSource}),
    statement=preview.statements[0],
    account=(await client.saveAccount(bound({account:{name:'Partial payment reconciliation',currency,
      sourceIdentitySha256:statement.account.identitySha256,note:'Same account as original receipt intake'}}))).account;
  const statementImport=(await client.receiveSource(bound({accountId:account.id,statementId:statement.id,
    source:statementSource,reviewSha256:preview.reviewSha256}))).import;
  assert.equal((await client.state()).accounts.find(row=>row.id===account.id).receiptIntakeAccountId,intake.id);
  let rows=(await client.transactions({accountId:account.id,limit:500})).items;
  const byId=id=>rows.find(row=>row.providerId===id&&row.status==='POSTED');
  await assert.rejects(client.receiveReceipt(byId('P60').id,bound({customerId:customer.id,grossAmount:'60.00',
    reference:'SHOULD-REUSE-ORIGINAL',reason:'Original intake already recorded this payment'})),{code:'BANK_EXISTING_CUSTOMER_RECEIPT'});
  for(const id of ['P60','P40','P50'])await client.match(byId(id).id,bound({
    parts:[{kind:'RECEIPT',receiptId:originalReceipt.id,amount:byId(id).amount}],reason:'Match this bank credit to its portion of the original aggregate'}));
  const third=await api.previewBankPosting(imported.id,aliasSelection(['P50']));
  await api.postBankReceipts(imported.id,request({proposal:third.proposal,reviewSha256:third.reviewSha256}));
  const aggregate=workspace.state.receivables.receipts.find(row=>row.id===originalReceipt.id),covered=receiptCoverageGroups(aggregate);
  assert.equal(covered.groups.size,3);assert.equal(covered.total,15000n);
  assert([...covered.groups.values()].every(group=>group.links.length===2));
  const closeInput={accountId:account.id,from:'2026-09-01',until:'2026-09-30',openingBalance:'0.00',closingBalance:'150.00',
    balanceNote:'The three original individual bank credits sum to150.00'};
  const reviewed=await client.previewClose(closeInput);assert(reviewed.ready,json(reviewed.problems));
  const closed=(await client.retainClose(bound({...closeInput,reviewSha256:reviewed.reviewSha256,name:'Original partial receipt close'}))).close;
  const oldArchive=Buffer.from(await (await client.closeFile(closed.id,'account.tar')).arrayBuffer());

  const correctedCsv='Date,Amount,ID,Reference,Payee\n2026-09-04,65.00,P60,COVERAGE-CUSTOMER,Original partial payment customer\n';
  const correctedImport=(await api.importBankSource(request(intakeSource(correctedCsv,'Original corrected bank credit.csv')))).bankImport;
  const correctionRow=(await api.bankImport(correctedImport.id,{view:'rows',limit:500})).rows.items.find(row=>row.transactionId==='P60');
  const correction=await api.previewBankPosting(correctedImport.id,{selections:[{rowId:correctionRow.id,
    sourceResolutionReason:'The original bank corrected this transaction from60.00 to65.00',splits:[{
      action:'CORRECT',receiptId:originalReceipt.id,amount:'65.00',effectiveDate:'2026-09-07',
      reason:'Correct only the original60.00 covered payment; retain the original40.00 and50.00 payments',
      allocations:[{invoiceId:draft.id,amount:'65.00',allocatedDate:'2026-09-07'}],
      residualAllocations:[{invoiceId:draft.id,amount:'85.00',allocatedDate:'2026-09-07'}]
    }]}]});
  const fixed=await api.postBankReceipts(correctedImport.id,request({proposal:correction.proposal,reviewSha256:correction.reviewSha256}));
  const replacement=fixed.receipts.find(row=>row.replacementRole==='CORRECTION'),residual=fixed.receipts.find(row=>row.replacementRole==='RESIDUAL');
  assert(replacement&&residual);assert.equal(replacement.amount,'65.00');assert.equal(residual.amount,'90.00');
  assert.equal((await api.state({asOf:'2026-09-07'})).invoices.find(row=>row.id===draft.id).amountDue,'0.00');
  assert((await client.closeDetail(closed.id)).currentProblems.some(row=>row.code==='RECEIPT_CHANGED'));
  assert.equal(sha(Buffer.from(await (await client.closeFile(closed.id,'account.tar')).arrayBuffer())),sha(oldArchive));

  const newSource=rootSource(correctedCsv,'Original corrected bank credit.csv'),newPreview=await client.previewSource({source:newSource});
  const newImport=(await client.receiveSource(bound({accountId:account.id,statementId:newPreview.statements[0].id,
    source:newSource,reviewSha256:newPreview.reviewSha256}))).import;
  const newRows=(await client.transactions({accountId:account.id,limit:500})).items,
    newRow=newRows.find(row=>row.providerId==='P60'&&row.status==='CONFLICT');
  assert(newRow);
  await client.reopenClose(closed.id,bound({reason:'Receive the corrected original bank payment and its dated receipt successors'}));
  for(const id of ['P60','P40','P50'])await client.undo(byId(id).id,bound({reason:'Reassign the original source to its exact current receipt successor'}));
  await client.resolve(newRow.id,bound({action:'APPLY_CORRECTION',targetId:byId('P60').id,
    reason:'Original provider transactionP60 has the bank-corrected65.00 amount'}));
  await client.match(newRow.id,bound({parts:[{kind:'RECEIPT',receiptId:replacement.id,amount:'65.00'}],reason:'Corrected original covered payment'}));
  for(const id of ['P40','P50'])await client.match(byId(id).id,bound({parts:[{
    kind:'RECEIPT',receiptId:residual.id,amount:byId(id).amount}],reason:'Retain this unchanged original payment with its residual receipt'}));
  const finalInput={...closeInput,closingBalance:'155.00',balanceNote:'Corrected65.00 plus unchanged40.00 and50.00 original bank payments'},
    finalReview=await client.previewClose(finalInput);
  assert(finalReview.ready,json(finalReview.problems));
  const finalClose=(await client.retainClose(bound({...finalInput,reviewSha256:finalReview.reviewSha256,
    name:'Complete original partial receipt correction'}))).close,
    finalArchive=Buffer.from(await (await client.closeFile(finalClose.id,'account.tar')).arrayBuffer());
  assert.equal((await client.closeDetail(finalClose.id)).currentProblems.length,0);
  assert.equal(receiptCoverageGroups(workspace.state.receivables.receipts.find(row=>row.id===residual.id)).total,9000n);
  assert.equal(receiptCoverageGroups(workspace.state.receivables.receipts.find(row=>row.id===replacement.id)).total,6500n);
  await writeFile(join(outputDir,'partial-receipts-original-close.tar'),oldArchive,{mode:0o600});
  await writeFile(join(outputDir,'partial-receipts-corrected-close.tar'),finalArchive,{mode:0o600});
  return {name:'both intake directions, complete partial receipt correction and accountant handover',
    bankAccountId:account.id,intakeAccountId:intake.id,customerId:customer.id,invoiceId:draft.id,
    originalReceiptId:originalReceipt.id,correctedReceiptId:replacement.id,residualReceiptId:residual.id,
    statementImportIds:[statementImport.id,newImport.id],intakeImportIds:[imported.id,correctedImport.id],
    originalCloseId:closed.id,finalCloseId:finalClose.id,originalTotal:'150.00',correctedTotal:'155.00',
    correctedCoveredPayment:'65.00',retainedOtherPayments:'90.00',invoiceAmountDue:'0.00',residualUnallocated:'5.00',
    originalArchive:{bytes:oldArchive.length,sha256:sha(oldArchive)},completeArchive:{bytes:finalArchive.length,sha256:sha(finalArchive)}};
}
