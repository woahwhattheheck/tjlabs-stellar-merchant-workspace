#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// One complete native customer/bank lifecycle using original files, writers, HTTP, SDK and CLI.
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {openAccountingWorkspace} from '../../workspace/store.mjs';
import {ReceivablesWorkspace} from '../store.mjs';
import {createReceivablesServer} from '../server.mjs';
import {BankStatementsWorkspace} from './store.mjs';
import {BankStatementsClient} from './client.mjs';
import {json,sha} from '../core.mjs';
import {receiveOriginalIntakeAlias,receivePartialIntake} from './INTAKE_RECEIVE.mjs';
import {receiveBankBrowser} from './BROWSER_RECEIVE.mjs';

const phases=[],files=[];
const phase=(name,details={})=>phases.push({name,...details});
const actor='Native bank and customer account receiving';
const currency={code:'USD',scale:2};
function sourceStrKey(version,fill) {
  const bytes=Buffer.alloc(35,fill);bytes[0]=version;let crc=0;
  for(const byte of bytes.subarray(0,33)){crc^=byte<<8;for(let i=0;i<8;i++)crc=((crc<<1)^(crc&0x8000?0x1021:0))&65535;}
  bytes[33]=crc&255;bytes[34]=crc>>8;
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let result='',bits=0,acc=0;
  for(const byte of bytes){acc=(acc<<8)|byte;bits+=8;while(bits>=5){bits-=5;result+=alphabet[(acc>>>bits)&31];}acc&=(1<<bits)-1;}
  return result;
}
const nativeAccount='<BANKACCTFROM><BANKID>NATIVE-RECEIVING-BANK</BANKID><ACCTID>operating-001</ACCTID><ACCTTYPE>CHECKING</ACCTTYPE></BANKACCTFROM>';
const nativeRow=(type,date,amount,id,payee,reference,extra='')=>
  '<STMTTRN><TRNTYPE>'+type+'</TRNTYPE><DTPOSTED>'+date+'</DTPOSTED><TRNAMT>'+amount+'</TRNAMT><FITID>'+id+
  '</FITID><NAME>'+payee+'</NAME><REFNUM>'+reference+'</REFNUM>'+extra+'</STMTTRN>';
function ofx(rows,{name='Original native bank statement.ofx',ledger='1272.00',end='20261005000000',closing=true}={}) {
  const content='<?xml version="1.0" encoding="UTF-8"?>\n<?OFX OFXHEADER="200" VERSION="230" SECURITY="NONE" OLDFILEUID="NONE" NEWFILEUID="NONE"?>\n'+
    '<OFX><SIGNONMSGSRSV1><SONRS><STATUS><CODE>0</CODE><SEVERITY>INFO</SEVERITY></STATUS><DTSERVER>20261005120000</DTSERVER><LANGUAGE>ENG</LANGUAGE>'+
    '<FI><ORG>Native application receiving bank</ORG><FID>120026</FID></FI></SONRS></SIGNONMSGSRSV1>'+
    '<BANKMSGSRSV1><STMTTRNRS><TRNUID>statement-001</TRNUID><STATUS><CODE>0</CODE><SEVERITY>INFO</SEVERITY></STATUS>'+
    '<STMTRS><CURDEF>USD</CURDEF>'+nativeAccount+'<BANKTRANLIST><DTSTART>20261001000000</DTSTART><DTEND>'+end+'</DTEND>'+
    rows.join('\n')+'</BANKTRANLIST><BANKTRANLISTP><DTASOF>20261004235959[-5:EST]</DTASOF><STMTTRNP><TRNTYPE>CREDIT</TRNTYPE><DTTRAN>20261004170000[-5:EST]</DTTRAN>'+
    '<TRNAMT>25.00</TRNAMT><NAME>Pending customer deposit</NAME></STMTTRNP></BANKTRANLISTP>'+
    '<LEDGERBAL><BALAMT>'+ledger+'</BALAMT><DTASOF>20261004235959[-5:EST]</DTASOF></LEDGERBAL></STMTRS></STMTTRNRS>'+
    (closing?'<STMTENDTRNRS><TRNUID>closing-001</TRNUID><STATUS><CODE>0</CODE><SEVERITY>INFO</SEVERITY></STATUS><STMTENDRS><CURDEF>USD</CURDEF>'+
      nativeAccount+'<CLOSING><FITID>native-closing-oct04</FITID><DTOPEN>20261001</DTOPEN><DTCLOSE>20261004</DTCLOSE>'+
      '<DTNEXT>20261104</DTNEXT><BALOPEN>1000.00</BALOPEN><BALCLOSE>1272.00</BALCLOSE>'+
      '<DTPOSTSTART>20261001</DTPOSTSTART><DTPOSTEND>20261005</DTPOSTEND></CLOSING></STMTENDRS></STMTENDTRNRS>':'')+
    '</BANKMSGSRSV1></OFX>';
  return {format:'OFX',file:{name,content,encoding:'utf8'}};
}
const csvText='Date,Amount,AccountAmount,Payee,Reference,ID,Status,Balance\r\n'+
  '2026-10-01,,,Opening bank balance,,,,1000.00\r\n'+
  '2026-10-02,200.00,200.00,Existing customer payment,R200,C200,Booked,\r\n'+
  '2026-10-05,10.00,12.00,Separate other income,OTHER,,Booked,\r\n'+
  '2026-10-05,10.00,12.00,Separate other income,OTHER,,Booked,\r\n'+
  '2026-10-31,,,Closing bank balance,,,,1292.00\r\n';
function csvSource(column='Amount') {
  return {format:'CSV',file:{name:'Original mapped bank export.csv',content:csvText,encoding:'utf8'},
    csv:{delimiter:',',headerRow:1,dateFormat:'YMD',decimalSeparator:'.',groupSeparator:',',amountMode:'SIGNED',
      account:{kind:'BANK',bankId:'NATIVE-RECEIVING-BANK',accountId:'operating-001',accountType:'CHECKING',currency:'USD'},
      columns:{postedDate:'Date',amount:column,payee:'Payee',reference:'Reference',providerId:'ID',status:'Status',balance:'Balance'},
      statusValues:{posted:['Booked'],pending:['Pending']},
      balanceRecords:[{recordNumber:2,kind:'OPENING',amountColumn:'Balance',dateColumn:'Date'},
        {recordNumber:6,kind:'CLOSING',amountColumn:'Balance',dateColumn:'Date'}]}};
}
function tarEntries(bytes) {
  const result=new Map();let offset=0;
  while(offset+512<=bytes.length) {
    const header=bytes.subarray(offset,offset+512);if(header.every(byte=>byte===0))break;
    const leaf=header.subarray(0,100).toString('utf8').replace(/\0.*$/,''),prefix=header.subarray(345,500).toString('utf8').replace(/\0.*$/,'');
    const name=prefix?prefix+'/'+leaf:leaf;
    const size=parseInt(header.subarray(124,136).toString('ascii').replace(/\0.*$/,'').trim(),8);
    assert(Number.isSafeInteger(size)&&size>=0);assert(!result.has(name),'Unique original archive filename');
    result.set(name,bytes.subarray(offset+512,offset+512+size));offset+=512+Math.ceil(size/512)*512;
  }
  return result;
}
const root=await mkdtemp(join(process.env.SCF_BANK_TMP??tmpdir(),'merchant-bank-'));
let workspace,running;
try {
  const directory=join(root,'accounting'),outboxDir=join(root,'outbox'),proofDir=join(root,'proofs'),termsFile=join(root,'terms.json');
  await mkdir(outboxDir,{mode:0o700});await mkdir(proofDir,{mode:0o700});
  await writeFile(termsFile,json({schema:'stellar-forge.merchant-accounting-terms.v1',routes:[{
    routeId:'native-bank-receiving',method:'GET',network:'stellar:testnet',asset:sourceStrKey(16,1),payTo:sourceStrKey(48,2),
    amountAtomic:'1000000',unitPriceUsd:'1',unitCostUsd:null,priceBasis:'Native bank application receiving'
  }]}),{mode:0o600});
  const options={directory,outboxDir,proofDir,termsFile};
  workspace=await openAccountingWorkspace(options);
  const r=await new ReceivablesWorkspace(workspace).init();
  const request=values=>({revision:workspace.state.revision,actor,requestId:randomUUID(),...values});
  const customer=(await r.saveCustomer(request({reference:'NATIVE-BANK-CUSTOMER',name:'Native receiving customer',email:'',address:'',note:''}))).customer;
  await r.settings(request({name:'Native receiving merchant',invoicePrefix:'BANK',creditPrefix:'BANKCR'}));
  const invoice=(await r.saveDraft(request({customerId:customer.id,currency,issueDate:'2026-10-01',dueDate:'2026-10-31',
    lines:[{id:'implementation',description:'Customer implementation',quantity:'1',unitAmount:'100.00',taxAmount:'0.00'}],note:'Native complete bank receiving'}))).invoice;
  const invoiceReview=await r.preview(invoice.id);
  await r.issue(invoice.id,request({expectedVersion:invoiceReview.expectedVersion,previewSha256:invoiceReview.previewSha256}));
  const invoiceFile=await r.file(invoice.id,'invoice.json');
  const originalReceipt=(await r.receipt(request({customerId:customer.id,currency,amount:'200.00',receivedDate:'2026-10-02',
    method:'Bank transfer',reference:'R200',note:'Original customer payment recorded before statement import'}))).receipt;
  const refundReview=await r.previewRefund({receiptId:originalReceipt.id,amount:'20.00',effectiveDate:'2026-10-04',
    reason:'Customer requested return of an unapplied payment',customerNote:'Original refund for native receiving',funding:[],
    payout:{kind:'OPERATOR_RECORDED',method:'Bank transfer',reference:'REF20',refundDate:'2026-10-04'}});
  const refundResult=await r.commitRefund(request({proposal:refundReview.proposal,reviewSha256:refundReview.reviewSha256}));
  const refundId=refundResult.operation.result.refundId;
  assert(refundId);assert.equal(refundResult.refund.status,'RECORDED');
  phase('original invoice, existing customer receipt and recorded customer refund',{invoiceId:invoice.id,receiptId:originalReceipt.id,refundId});

  running=await createReceivablesServer({workspace,port:0});
  const origin=new URL(running.url).origin;
  const client=new BankStatementsClient({baseUrl:origin+'/api/receivables/bank-statements'});
  const initial=await client.state(),bound=values=>request({workspaceId:initial.workspaceId,...values});
  const original=ofx([
    nativeRow('CREDIT','20261002','97.00','B100','Customer net deposit','NET100'),
    nativeRow('CREDIT','20261002','200.00','C200','Existing customer payment','R200'),
    nativeRow('FEE','20261003','-5.00','FEE5','Bank account fee','FEE5'),
    nativeRow('OTHER','20261003','0.00','ZERO','Zero amount bank entry','ZERO'),
    nativeRow('DEBIT','20261004','-20.00','REF20','Customer refund','REF20')
  ]);
  const preview=await client.previewSource({source:original});
  const selected=preview.statements.find(row=>row.kind==='TRANSACTION_DOWNLOAD'&&row.sample.length)??preview.statements.find(row=>row.sample.length);
  assert(selected);assert.equal(selected.pendingCount,1);assert.equal(selected.sample.length,5);
  const account=(await client.saveAccount(bound({account:{name:'Operating bank',currency,sourceIdentitySha256:selected.account.identitySha256,
    note:'Original financial institution and operating account'}}))).account;
  const importRequest=bound({accountId:account.id,statementId:selected.id,source:original,reviewSha256:preview.reviewSha256});
  const imported=(await client.receiveSource(importRequest)).import;
  assert.equal((await client.receiveSource(importRequest)).operation.replayed,true);
  const nativeBytes=Buffer.from(await (await client.importFile(imported.id,'original')).arrayBuffer());
  assert.deepEqual(nativeBytes,Buffer.from(original.file.content));
  const all=await client.transactions({accountId:account.id,limit:500});
  assert.equal(all.total,5);const byProvider=id=>all.items.find(row=>row.providerId===id);
  assert(all.items.every(row=>row.status==='POSTED'));
  const beforeReceipt=r.data().receipts.length;
  const receiveRequest=bound({customerId:customer.id,grossAmount:'100.00',feeAmount:'3.00',reference:'NET100',
    note:'Gross customer payment from original bank net credit',feeNote:'Processor deducted original deposit fee',feeLedgerCode:'BANK-FEES',
    reason:'Gross100 less processor fee3 equals original bank credit97',invoiceId:invoice.id,allocationAmount:'100.00'});
  const received=await client.receiveReceipt(byProvider('B100').id,receiveRequest);
  assert.equal(received.invoice.amountDue,'0.00');assert.equal(received.receipt.amount,'100.00');
  assert.equal(received.transaction.match.parts.length,2);assert.equal(r.data().receipts.length,beforeReceipt+1);
  assert.equal(received.transaction.match.parts.map(row=>BigInt(row.minorAmount)).reduce((a,b)=>a+b,0n),9700n);
  await client.match(byProvider('C200').id,bound({parts:[{kind:'RECEIPT',receiptId:originalReceipt.id,amount:'200.00'}],
    reason:'Original same-currency customer payment and native bank reference'}));
  await client.match(byProvider('FEE5').id,bound({parts:[{kind:'FEE',amount:'-5.00',note:'Account maintenance fee',ledgerCode:'BANK-FEES'}],
    reason:'Original statement fee'}));
  await client.match(byProvider('ZERO').id,bound({parts:[],reason:'Original zero-amount bank record retained without cash postings'}));
  await client.match(byProvider('REF20').id,bound({parts:[{kind:'REFUND',refundId,amount:'-20.00'}],
    reason:'Original recorded customer refund'}));
  const replay=await client.receiveReceipt(byProvider('B100').id,receiveRequest);
  assert.equal(replay.operation.replayed,true);assert.equal(replay.receipt.id,received.receipt.id);
  assert.equal(r.data().receipts.length,beforeReceipt+1);assert.equal((await client.getOperation(receiveRequest.requestId)).receipt.id,received.receipt.id);
  phase('original native OFX intake, exact gross/fee split, shared invoice allocation and receipt/refund matching',
    {accountId:account.id,importId:imported.id,sourceSha256:sha(nativeBytes),newReceiptId:received.receipt.id,originalRequestId:receiveRequest.requestId});

  phases.push(await receiveOriginalIntakeAlias({origin,workspace,account,original,received,originalReceipt,actor}));

  const nativeClosing=selected.balances.closing[0];assert(nativeClosing);
  const closeInput={accountId:account.id,from:'2026-10-01',until:'2026-10-04',openingBalance:'1000.00',closingBalance:'1272.00',
    sourceClosing:{importId:imported.id,id:nativeClosing.id}};
  const closeReview=await client.previewClose(closeInput);assert(closeReview.ready,json(closeReview.problems));
  assert.equal(closeReview.difference,'0.00');assert.equal(closeReview.pending.length,1);
  const close=(await client.retainClose(bound({...closeInput,reviewSha256:closeReview.reviewSha256,name:'Original native bank close',note:''}))).close;
  const firstArchive=Buffer.from(await (await client.closeFile(close.id,'account.tar')).arrayBuffer());
  const archive=tarEntries(firstArchive);assert(archive.has('source-'+imported.id+'.ofx'));
  assert.deepEqual(archive.get('source-'+imported.id+'.ofx'),nativeBytes);
  assert(archive.has('customer-'+customer.id+'.tar'));assert(archive.has('editable-reconciliation.json'));
  const manifest=JSON.parse(archive.get('manifest.json'));
  for(const [name,descriptor]of Object.entries(manifest.files)){assert.equal(sha(archive.get(name)),descriptor.sha256);assert.equal(archive.get(name).length,descriptor.bytes);}
  const customerFiles=tarEntries(archive.get('customer-'+customer.id+'.tar'));
  assert([...customerFiles.values()].some(bytes=>sha(bytes)===sha(invoiceFile.bytes)),'Complete original issued invoice accompanies customer account');
  phase('source-linked balanced bank close and complete original accountant/customer archive',
    {closeId:close.id,archiveBytes:firstArchive.length,archiveSha256:sha(firstArchive),files:archive.size});

  const mapped=csvSource(),mappedPreview=await client.previewSource({source:mapped}),mappedAccount=mappedPreview.statements[0];
  assert.equal(mappedAccount.account.identitySha256,selected.account.identitySha256);
  const mappedImport=(await client.receiveSource(bound({accountId:account.id,statementId:mappedAccount.id,source:mapped,reviewSha256:mappedPreview.reviewSha256}))).import;
  let rows=(await client.transactions({accountId:account.id,limit:500})).items;
  const mappedRows=rows.filter(row=>row.copies.some(copy=>copy.importId===mappedImport.id)&&row.id!==byProvider('C200').id);
  const copy=mappedRows.find(row=>row.providerId==='C200');assert(copy);assert.equal(copy.status,'DUPLICATE');
  const incomeRows=mappedRows.filter(row=>row.sourceRowId&&row.reference==='OTHER');
  assert.equal(incomeRows.length,2);assert(incomeRows.every(row=>row.status==='POSTED'));assert.notEqual(incomeRows[0].id,incomeRows[1].id);
  for(const row of incomeRows)await client.match(row.id,bound({parts:[{kind:'INCOME',amount:'10.00',note:'Separate original source record',ledgerCode:'OTHER-INCOME'}],
    reason:'Original record position distinguishes two equal bank credits'}));
  phase('overlapping native ID alias and two distinct equal CSV transactions',{importId:mappedImport.id,duplicateId:copy.id,distinctIds:incomeRows.map(row=>row.id)});

  const corrected=ofx([nativeRow('FEE','20261003','-6.00','FEE6','Corrected bank account fee','FEE6',
    '<CORRECTFITID>FEE5</CORRECTFITID><CORRECTACTION>REPLACE</CORRECTACTION>')],{name:'Original bank correction.ofx',ledger:'1271.00',closing:false});
  const correctionPreview=await client.previewSource({source:corrected}),correctionStatement=correctionPreview.statements.find(row=>row.sample.length);
  const correctionImport=(await client.receiveSource(bound({accountId:account.id,statementId:correctionStatement.id,source:corrected,
    reviewSha256:correctionPreview.reviewSha256}))).import;
  const correction=(await client.transactions({accountId:account.id,limit:500})).items.find(row=>row.providerId==='FEE6');
  assert.equal(correction.status,'CORRECTION_REVIEW');
  const changedClosed=await client.closeDetail(close.id);assert(changedClosed.newTransactionIds.includes(correction.id));
  await assert.rejects(client.resolve(correction.id,bound({action:'APPLY_CORRECTION',targetId:byProvider('FEE5').id,reason:'Original bank corrected fee'})),
    {code:'BANK_PERIOD_CLOSED'});
  await client.reopenClose(close.id,bound({reason:'Original bank issued a fee correction'}));
  await client.undo(byProvider('FEE5').id,bound({reason:'Replace original fee using its native correction'}));
  await client.resolve(correction.id,bound({action:'APPLY_CORRECTION',targetId:byProvider('FEE5').id,reason:'Original CORRECTFITID and REPLACE'}));
  await client.match(correction.id,bound({parts:[{kind:'FEE',amount:'-6.00',note:'Original corrected account fee',ledgerCode:'BANK-FEES'}],
    reason:'Original replacement bank transaction'}));
  assert.equal((await client.detail(byProvider('FEE5').id)).transaction.status,'SUPERSEDED');
  const secondInput={accountId:account.id,from:'2026-10-01',until:'2026-10-31',openingBalance:'1000.00',closingBalance:'1291.00',
    balanceNote:'Original period opening1000; originalOFX credits297/debits25; two additionalCSV credits20; originalfee correction debits1.'};
  const secondReview=await client.previewClose(secondInput);assert(secondReview.ready,json(secondReview.problems));
  const secondClose=(await client.retainClose(bound({...secondInput,reviewSha256:secondReview.reviewSha256,name:'Full period after native fee correction'}))).close;
  assert.equal(sha(Buffer.from(await (await client.closeFile(close.id,'account.tar')).arrayBuffer())),sha(firstArchive));
  phase('native source correction, retained reopening and unchanged earlier close',
    {correctionImportId:correctionImport.id,correctedTransactionId:correction.id,secondCloseId:secondClose.id,closingBalance:secondClose.closingBalance});

  const remapped=csvSource('AccountAmount'),remappedPreview=await client.previewSource({source:remapped});
  assert.equal(remappedPreview.file.sha256,mappedPreview.file.sha256);assert.notEqual(remappedPreview.reviewSha256,mappedPreview.reviewSha256);
  await assert.rejects(client.receiveSource(bound({accountId:account.id,statementId:remappedPreview.statements[0].id,source:remapped,
    reviewSha256:remappedPreview.reviewSha256})),{code:'BANK_SOURCE_MAPPING_CHANGED'});
  const remappedImport=(await client.receiveSource(bound({accountId:account.id,statementId:remappedPreview.statements[0].id,
    source:remapped,reviewSha256:remappedPreview.reviewSha256,supersedesImportId:mappedImport.id}))).import;
  rows=(await client.transactions({accountId:account.id,limit:500})).items;
  const interpretationRows=rows.filter(row=>row.interpretationReplacesId&&incomeRows.some(old=>old.id===row.interpretationReplacesId));
  assert.equal(interpretationRows.length,2);assert(interpretationRows.every(row=>row.status==='CORRECTION_REVIEW'&&row.interpretationAction==='REPLACE'));
  await client.reopenClose(secondClose.id,bound({reason:'Review original account-amount column mapping'}));
  for(const row of interpretationRows) {
    await client.undo(row.interpretationReplacesId,bound({reason:'Review the original account amount from the same retained CSV'}));
    await client.resolve(row.id,bound({action:'APPLY_CORRECTION',targetId:row.interpretationReplacesId,
      reason:'The retained CSV AccountAmount column is the account-currency value'}));
    await client.match(row.id,bound({parts:[{kind:'INCOME',amount:'12.00',note:'Reviewed original AccountAmount column',ledgerCode:'OTHER-INCOME'}],
      reason:'Same original bytes and corrected explicit interpretation'}));
  }
  const finalInput={...secondInput,closingBalance:'1295.00',
    balanceNote:'Original1000 opening, gross cash credits297, bank debits26, two account-valued CSV credits24; all original source and interpretation editions retained.'};
  const finalReview=await client.previewClose(finalInput);assert(finalReview.ready,json(finalReview.problems));assert.equal(finalReview.difference,'0.00');
  const finalClose=(await client.retainClose(bound({...finalInput,reviewSha256:finalReview.reviewSha256,name:'Complete corrected bank reconciliation'}))).close;
  assert.equal(finalClose.previousCloseId,secondClose.id);
  const finalArchive=Buffer.from(await (await client.closeFile(finalClose.id,'account.tar')).arrayBuffer()),finalFiles=tarEntries(finalArchive);
  const editable=JSON.parse(finalFiles.get('editable-reconciliation.json'));
  assert.equal(editable.receipts.length,2);assert.equal(editable.refunds.length,1);
  assert.equal(editable.allocations.length,1);assert.equal(editable.customers.length,1);
  assert.equal(editable.imports.length,4);assert.equal(editable.transactions.filter(row=>row.status==='POSTED').length,7);
  assert.equal(editable.close.closingBalance,'1295.00');
  assert.equal((await client.closeDetail(finalClose.id)).currentProblems.length,0);
  assert.deepEqual(Buffer.from(await (await client.importFile(remappedImport.id,'original')).arrayBuffer()),Buffer.from(csvText));
  phase('same-byte CSV interpretation correction and complete replacement handover',
    {interpretationImportId:remappedImport.id,finalCloseId:finalClose.id,originalSourceEditions:editable.imports.length,
      originalBankRows:editable.transactions.length,activeBankRows:7,closingBalance:finalClose.closingBalance,archiveBytes:finalArchive.length,archiveSha256:sha(finalArchive)});

  const assetPaths=['/bank-statements/','/bank-statements/index.html','/bank-statements/app.mjs','/bank-statements/styles.css',
    '/bank-statements/config.json','/bank-statements/sdk/client.mjs','/bank-statements/client.mjs','/bank-statements/receivables-client.mjs',
    '/bank-statements/SOURCE_FORMATS.md','/receivables/','/api/receivables/state'];
  for(const path of assetPaths){const response=await fetch(origin+path);assert.equal(response.status,200,path);const bytes=Buffer.from(await response.arrayBuffer());
    assert(bytes.length>0,path);files.push({path,bytes:bytes.length,sha256:sha(bytes)});}
  const config=await (await fetch(origin+'/bank-statements/config.json')).json();assert.equal(config.apiBase,'/api/receivables/bank-statements');
  const unsafe=await fetch(origin+'/api/receivables/bank-statements/accounts',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  assert.equal(unsafe.status,403);
  const paged=await client.transactions({accountId:account.id,offset:2,limit:3});assert.equal(paged.items.length,3);assert(paged.total>3);
  phase('original HTTP boundary, complete application assets and all-row pagination',{assetCount:files.length,workspaceId:initial.workspaceId});

  const outputDir=join(root,'complete-handover');await mkdir(outputDir,{mode:0o700});
  phases.push(await receivePartialIntake({origin,workspace,client,receivables:r,workspaceId:initial.workspaceId,outputDir,actor}));
  const browserResult=await receiveBankBrowser({baseUrl:origin,workspaceId:initial.workspaceId,caseDirectory:directory,
    sourceDirectory:fileURLToPath(new URL('.',import.meta.url)),reportDirectory:join(outputDir,'browser'),
    scenario:{account,customer,receivables:r,original,originalImport:imported,originalClose:close,finalClose,
      browserExecutable:process.env.SCF_BANK_CHROMIUM}});
  const finalRevision=workspace.state.revision;
  await writeFile(join(outputDir,'account.tar'),finalArchive,{mode:0o600});
  await writeFile(join(outputDir,'original-close.tar'),firstArchive,{mode:0o600});
  await running.close();running=null;await workspace.close();workspace=null;
  workspace=await openAccountingWorkspace({directory});
  const cold=await new BankStatementsWorkspace(new ReceivablesWorkspace(workspace)).init();
  assert.equal(workspace.state.revision,finalRevision);
  assert.equal((await cold.getOperation(receiveRequest.requestId)).receipt.id,received.receipt.id);
  assert.equal(sha((await cold.closeFile(finalClose.id,'account.tar')).bytes),sha(finalArchive));
  assert.equal(sha((await cold.closeFile(close.id,'account.tar')).bytes),sha(firstArchive));
  assert.equal((await cold.closeDetail(finalClose.id)).currentProblems.length,0);
  await workspace.close();workspace=null;
  const cli=fileURLToPath(new URL('./cli.mjs',import.meta.url));
  const cliOutput=join(root,'cli-handover');
  const run=spawnSync(process.execPath,[cli,'export','--directory',directory,'--id',finalClose.id,'--out',cliOutput],{encoding:'utf8',maxBuffer:4_000_000});
  assert.equal(run.status,0,run.stderr);const cliReport=JSON.parse(run.stdout);
  assert.equal(sha(await readFile(join(cliOutput,'account.tar'))),sha(finalArchive));
  assert(cliReport.files.length>8);
  phase('cold original writer reopen, operation recovery and complete create-only CLI export',
    {revision:finalRevision,cliExportFiles:cliReport.files.length,cliArchiveSha256:sha(await readFile(join(cliOutput,'account.tar')))});

  const result={schema:'stellar-forge.merchant-bank-native-receiving.v1',status:'PASS',completedAt:new Date().toISOString(),
    node:process.version,originalWorkspace:{directory,workspaceId:initial.workspaceId,sourcesSha256:initial.sourcesSha256,revision:finalRevision},
    phases,browser:browserResult,assets:files,deliverable:{directory:outputDir,accountTar:{bytes:finalArchive.length,sha256:sha(finalArchive)},
      originalCloseTar:{bytes:firstArchive.length,sha256:sha(firstArchive)},cliDirectory:cliOutput}};
  await writeFile(join(outputDir,'native-result.json'),json(result),{mode:0o600});
  console.log(json(result));
} finally {
  if(running)await running.close();if(workspace)await workspace.close();
  if(process.env.SCF_BANK_KEEP!=='1')await rm(root,{recursive:true,force:true});
}
