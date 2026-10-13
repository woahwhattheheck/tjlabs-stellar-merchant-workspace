// SPDX-License-Identifier: MIT
// Exact cash reconciliation over the original merchant receipt and refund registers.
import {randomUUID} from 'node:crypto';
import {bankSourceMatches} from '../bank-receipts.mjs';
import {statementSourceEntry,sourceCoverageReview,receiptCoverageGroups,coverageLinksMatch} from '../bank-coverage.mjs';
import {need, plain, field, identifier, dateValue, currencyOf, currencyKey, minor, money,
  json, sha, refundAccountSummary, csv} from '../core.mjs';

export const BANK_SCHEMA = 'stellar-forge.merchant-bank-reconciliation.v1';
export const BANK_CLOSE_SCHEMA = 'stellar-forge.merchant-bank-close.v1';
export const BANK_REQUEST_BYTES = 24_000_000;
export const BANK_SOURCE_BYTES = 16_000_000;
export const BANK_ROW_LIMIT = 50_000;
export const now = () => new Date().toISOString();
export const clone = value => structuredClone(value);
export const emptyBank = () => ({schema:BANK_SCHEMA,accounts:[],imports:[],transactions:[],matches:[],closes:[],reopenings:[]});
const SHA = /^[a-f0-9]{64}$/;
export function bankData(receivables) {
  const value = receivables.bankStatements ?? emptyBank();
  need(value.schema === BANK_SCHEMA && ['accounts','imports','transactions','matches','closes','reopenings'].every(key=>Array.isArray(value[key])),
    'INVALID_BANK_WORKSPACE','The saved bank reconciliation register is invalid.',409);
  return value;
}
export function record(rows,id,label) {
  identifier(id,label); const row=rows.find(item=>item.id===id);
  need(row,'BANK_RECORD_NOT_FOUND','Choose an existing '+label+'.',404); return row;
}
export function activeMatch(bank,transactionId) {
  return bank.matches.find(row=>row.transactionId===transactionId&&!row.undoneAt)??null;
}
export function activeCloses(bank,accountId) {
  return bank.closes.filter(row=>(!accountId||row.accountId===accountId)&&!bank.reopenings.some(event=>event.closeId===row.id));
}
export function assertOpenDate(bank,accountId,date) {
  need(!date||!activeCloses(bank,accountId).some(row=>row.from<=date&&row.until>=date),
    'BANK_PERIOD_CLOSED','Reopen the saved bank reconciliation before changing a transaction in its period.',409);
}
export function amountOf(row,account) {
  need(row.valuation || row.currency===account.currency.code,'BANK_ROW_CURRENCY',
    'Review the account-currency value of this original foreign-currency transaction.');
  return minor(row.valuation?.amount??row.amount,account.currency,'statement amount',{signed:true});
}
export function transactionIdentity(row,accountId) {
  return row.providerKey?sha(json({accountId,providerKey:row.providerKey})):null;
}
export function financialFingerprint(row) {
  return sha(json({postedDate:row.postedDate,amount:row.amount,currency:row.currency,
    payee:row.payee,reference:row.reference,checkNumber:row.checkNumber,
    ...(row.camt?{camt:{creditDebit:row.camt.creditDebit,reversal:row.camt.reversal}}:{})}));
}
export function compactSourceRow(row) {
  const source=clone(row.source); delete source.raw;
  return Object.fromEntries(['id','providerId','providerKey','status','postedDate','postedAtRaw','postedAt',
    'amount','amountRaw','currency','currencyConversion','type','payee','extendedName','memo','reference','checkNumber',
    'serverTransactionId','userDate','availableDate','expiresAt','correction','runningBalance','issues','eligible',
    'candidateFingerprint'].map(key=>[key,clone(row[key]??null)]).concat([['source',source]],row.camt?[['camt',clone(row.camt)]]:[]));
}
export function normalizeAccount(value) {
  need(plain(value),'INVALID_BANK_ACCOUNT','Provide an account name, exact source identity and currency.');
  const currency=currencyOf(value.currency);
  need(SHA.test(value.sourceIdentitySha256??''),'BANK_ACCOUNT_IDENTITY_REQUIRED',
    'Select the exact original financial institution and account from the source preview.');
  return {name:field(value.name,'account name',160),currency,sourceIdentitySha256:value.sourceIdentitySha256,
    note:field(value.note??'','account note',3000,true)};
}
export function camtMessageSummary(value) {
  if(!value)return undefined;
  const {sourceTree,...metadata}=value;
  return clone(metadata);
}
export function compactExcludedRow(row) {
  if(row.row?.camt) {
    const entry=compactSourceRow(row.row);
    return {reason:clone(row.reason),source:clone(entry.source),row:entry};
  }
  return row.camt?{...compactSourceRow(row),reason:clone(row.reason??null)}:clone(row);
}
export function sourcePreview(report) {
  return {schema:report.schema,format:report.format,file:clone(report.file),interpretation:clone(report.interpretation),
    camt:camtMessageSummary(report.camt),
    issues:clone(report.issues),csv:report.csv?{...clone(report.csv),preamble:report.csv.preamble?.map(row=>({source:row.source,cells:row.cells}))}:undefined,
    statements:report.statements.map(row=>({id:row.id,kind:row.kind,account:clone(row.account),period:clone(row.period),
      balances:clone(row.balances),issues:clone(row.issues),summary:clone(row.summary),camt:clone(row.camt),
      sample:row.rows.slice(0,20).map(compactSourceRow),pendingCount:row.pendingRows.length,
      excludedRows:row.excludedRows.map(compactExcludedRow)}))};
}

export function previewIdentity(report,input) {
  return sha(json({fileSha256:report.file.sha256,format:report.format,textEncoding:report.file.textEncoding,
    accountNamespace:input.accountNamespace??null,csv:input.csv??null,
    ...(report.format==='CAMT053'?{camt:input.camt??null,interpretation:report.interpretation}:{}),
    statements:report.statements.map(row=>({id:row.id,account:row.account.identitySha256,summary:row.summary,period:row.period}))}));
}
export function targetUsed(bank,kind,id,exceptMatchId=null) {
  let total=0n;
  for(const match of bank.matches) if(!match.undoneAt&&match.id!==exceptMatchId) {
    for(const part of match.parts) if(part.kind===kind&&part.targetId===id) total+=BigInt(part.minorAmount);
  }
  return total;
}
function targetPart(data,bank,account,transaction,value,used) {
  const kind=field(value.kind,'posting kind',40),amount=minor(value.amount,account.currency,'posting amount',{signed:true});
  need(amount!==0n,'EMPTY_BANK_POSTING','Enter a nonzero amount for each posting.');
  const note=field(value.note??'','posting note',3000,true),ledgerCode=field(value.ledgerCode??'','accounting code',100,true);
  let targetId=null,target=null;
  if(kind==='RECEIPT') {
    targetId=identifier(value.receiptId??value.targetId,'receipt');const receipt=record(data.receipts,targetId,'receipt');
    need(currencyKey(receipt.currency)===currencyKey(account.currency),'BANK_MATCH_CURRENCY','Match receipts in the same account currency and precision.');
    need(account.sourceIdentity?.kind!=='CREDIT_CARD'&&amount>0n&&(!receipt.voidDate||receipt.voidDate>transaction.postedDate),
      'BANK_RECEIPT_CLOSED','Choose a current positive customer payment for this bank credit.',409);
    const usedKey=kind+':'+targetId,allocated=(used.get(usedKey)??0n)+amount;
    need(allocated<=minor(receipt.amount,account.currency),'BANK_RECEIPT_ALREADY_MATCHED',
      'These bank postings exceed the original customer payment. Review its existing matches.',409);
    used.set(usedKey,(used.get(usedKey)??0n)+amount);
    target={id:receipt.id,reference:receipt.reference,customerId:receipt.customerId,customerName:receipt.customer.name,
      amount:receipt.amount,currency:clone(receipt.currency),receivedDate:receipt.receivedDate,sourceKey:receipt.sourceKey};
  } else if(kind==='REFUND') {
    targetId=identifier(value.refundId??value.targetId,'refund');const row=record(data.refunds??[],targetId,'refund');
    const summary=refundAccountSummary(row,'9999-12-31');
    need(summary.accountingScope==='COMMERCIAL'&&summary.effectiveStatus==='RECORDED'&&amount<0n&&
      currencyKey(summary.currency)===currencyKey(account.currency),'BANK_REFUND_REQUIRED',
      'Choose a recorded commercial refund in the same account currency and precision.',409);
    const usedKey=kind+':'+targetId,allocated=targetUsed(bank,kind,targetId)+(used.get(usedKey)??0n)+amount;
    need(-allocated<=minor(summary.refunded,account.currency),'BANK_REFUND_ALREADY_MATCHED',
      'These bank postings exceed the original refund. Review its existing matches.',409);
    used.set(usedKey,(used.get(usedKey)??0n)+amount); target=clone(summary);
  } else {
    need(['FEE','EXPENSE','INCOME','INTEREST','TRANSFER','CAPITAL'].includes(kind),
      'INVALID_BANK_POSTING_KIND','Choose a receipt, refund, fee, expense, income, interest, transfer or capital posting.');
    need(note.length>0,'BANK_POSTING_NOTE_REQUIRED','Describe the source and purpose of this accountant posting.');
    need(!['FEE','EXPENSE'].includes(kind)||amount<0n,'BANK_POSTING_SIGN','Fees and expenses use negative bank amounts.');
    need(kind!=='INCOME'||amount>0n,'BANK_POSTING_SIGN','Income uses a positive bank amount.');
    if(kind==='TRANSFER') need(field(value.reference,'transfer counterpart reference',300),
      'BANK_TRANSFER_REFERENCE','Retain the other account or transfer reference.');
  }
  return {kind,targetId,amount:money(amount,account.currency),minorAmount:amount.toString(),note,ledgerCode,target,
    reference:field(value.reference??'','posting reference',300,true)};
}
export function prepareMatch(data,account,transaction,value) {
  const bank=bankData(data);
  need(transaction.accountId===account.id&&transaction.status==='POSTED','BANK_TRANSACTION_REVIEW_REQUIRED',
    'Resolve this original transaction before matching it.',409);
  assertOpenDate(bank,account.id,transaction.postedDate);
  need(!activeMatch(bank,transaction.id),'BANK_TRANSACTION_ALREADY_MATCHED','Undo the existing match before changing its postings.',409);
  const expected=amountOf(transaction,account),used=new Map();
  need(Array.isArray(value.parts)&&(value.parts.length>0||expected===0n)&&value.parts.length<=500,'INVALID_BANK_POSTINGS',
    'Provide exact posting parts, or retain an explained zero-amount transaction without cash postings.');
  const parts=value.parts.map(row=>{need(plain(row),'INVALID_BANK_POSTING','Provide one posting object per part.');
    return targetPart(data,bank,account,transaction,row,used);});
  const total=parts.reduce((sum,row)=>sum+BigInt(row.minorAmount),0n);
  need(total===expected,'BANK_MATCH_DIFFERENCE','Posting parts must add exactly to the signed bank transaction.',409);
  const entry=statementSourceEntry(data,account,transaction),receiptCoverage=[];
  need(entry,'BANK_INTAKE_ACCOUNT_MISSING','Receive the original statement into its saved receipt intake account.',409);
  const matches=bankSourceMatches(data,entry.bankImport,entry.row),
    distinctPaymentReason=transaction.history?.filter(item=>item.action==='ACCEPT_DISTINCT').at(-1)?.reason??'';
  for(const [key,units] of used)if(key.startsWith('RECEIPT:')) {
    const receiptId=key.slice('RECEIPT:'.length),receipt=record(data.receipts,receiptId,'receipt'),
      originalParts=value.parts.filter(part=>part.kind==='RECEIPT'&&(part.receiptId??part.targetId)===receiptId),
      requestedKeys=[...new Set(originalParts.map(part=>part.coverageKey).filter(Boolean))];
    need(requestedKeys.length<=1,'BANK_SOURCE_COVERAGE_AMBIGUOUS',
      'Choose one original payment coverage group for this receipt and bank transaction.',409);
    const review=sourceCoverageReview(receipt,entry.bankImport,entry.row,matches,money(units,account.currency),
      distinctPaymentReason,receipt.bankSources??[],requestedKeys[0]??null);
    receiptCoverage.push({receiptId,distinctPaymentReason,review});
  }
  return {transactionId:transaction.id,accountId:account.id,currency:clone(account.currency),amount:money(expected,account.currency),
    parts,receiptCoverage,reason:field(value.reason,'match explanation',4000),sourceFingerprint:transaction.financialSha256};
}
export function matchView(bank,row) {
  return {...clone(row),match:clone(activeMatch(bank,row.id)),
    candidates:row.candidateIds?.map(id=>{const other=bank.transactions.find(item=>item.id===id);return other?{
      id:other.id,postedDate:other.postedDate,amount:other.amount,currency:other.currency,payee:other.payee,
      providerId:other.providerId,status:other.status,reference:other.reference}:null;}).filter(Boolean)??[],
    closed:activeCloses(bank,row.accountId).some(close=>row.postedDate&&close.from<=row.postedDate&&close.until>=row.postedDate)};
}
export function matchSuggestions(data,account,transaction) {
  const bank=bankData(data);let amount;
  try { amount=amountOf(transaction,account); } catch { return {receipts:[],refunds:[]}; }
  const entry=statementSourceEntry(data,account,transaction),
    sourceMatches=entry?bankSourceMatches(data,entry.bankImport,entry.row):[],
    existingIds=new Set(sourceMatches.flatMap(item=>item.receiptIds)),
    distinctPaymentReason=transaction.history?.filter(item=>item.action==='ACCEPT_DISTINCT').at(-1)?.reason??'';
  const receipts=data.receipts.filter(row=>currencyKey(row.currency)===currencyKey(account.currency)&&
      (!row.voidDate||row.voidDate>transaction.postedDate))
    .map(row=>{const covered=receiptCoverageGroups(row),related=entry?[...covered.groups.values()]
      .filter(group=>group.links.some(link=>coverageLinksMatch(link,entry.bankImport,entry.row,sourceMatches,distinctPaymentReason))):[];
      const sourceCovered=related.reduce((sum,group)=>sum+group.amount,0n),
        remaining=minor(row.amount,account.currency)-covered.total+sourceCovered;
      const reference=(transaction.reference||transaction.memo||'').toLowerCase(),candidate=row.reference.toLowerCase();
      return {id:row.id,reference:row.reference,customerId:row.customerId,customerName:row.customer.name,receivedDate:row.receivedDate,
        amount:row.amount,remaining:money(remaining,account.currency),exactAmount:remaining===amount,
        sourceMatch:existingIds.has(row.id)||sourceCovered>0n,sourceCoveredAmount:money(sourceCovered,account.currency),
        coverageGroups:related.map(group=>({key:group.key,amount:money(group.amount,account.currency),sources:clone(group.links)})),
        referenceMatch:reference.length>0&&candidate.length>0&&(reference.includes(candidate)||candidate.includes(reference))};})
    .filter(row=>minor(row.remaining,account.currency)>0n)
    .sort((a,b)=>Number(b.sourceMatch)-Number(a.sourceMatch)||Number(b.exactAmount)-Number(a.exactAmount)||Number(b.referenceMatch)-Number(a.referenceMatch)||a.receivedDate.localeCompare(b.receivedDate));
  const refunds=(data.refunds??[]).map(row=>refundAccountSummary(row,'9999-12-31'))
    .filter(row=>row.accountingScope==='COMMERCIAL'&&row.effectiveStatus==='RECORDED'&&currencyKey(row.currency)===currencyKey(account.currency))
    .map(row=>{const remaining=minor(row.refunded,account.currency)+targetUsed(bank,'REFUND',row.id);
      return {...row,remaining:money(remaining,account.currency),exactAmount:remaining===-amount};})
    .filter(row=>minor(row.remaining,account.currency)>0n)
    .sort((a,b)=>Number(b.exactAmount)-Number(a.exactAmount));
  return {receipts,refunds};
}
export function accountSummary(bank,account) {
  const rows=bank.transactions.filter(row=>row.accountId===account.id),posted=rows.filter(row=>row.status==='POSTED');
  return {...clone(account),importCount:bank.imports.filter(row=>row.accountId===account.id).length,
    postedCount:posted.length,matchedCount:posted.filter(row=>activeMatch(bank,row.id)).length,
    reviewCount:rows.filter(row=>['OVERLAP_REVIEW','CONFLICT','CORRECTION_REVIEW','INVALID','FOREIGN_CURRENCY'].includes(row.status)).length,
    activeCloseCount:activeCloses(bank,account.id).length};
}
export function importSummary(row) {
  const {rowIds,pendingRows,...rest}=row;
  return {...clone(rest),rowCount:rowIds.length,pendingCount:pendingRows.length};
}
export function closePreview(data,account,value,periodClose=null,sourceAssembly=null) {
  const bank=bankData(data),from=dateValue(value.from,'opening date'),until=dateValue(value.until,'closing date');
  need(from<=until,'INVALID_BANK_PERIOD','The opening date must be on or before the closing date.');
  const opening=minor(value.openingBalance,account.currency,'opening bank balance',{signed:true});
  const closing=minor(value.closingBalance,account.currency,'closing bank balance',{signed:true});
  let sourceClosing=null;
  if(value.sourceClosing) {
    const assembled=value.sourceClosing.kind==='CAMT_PAGE_ASSEMBLY';
    need(!assembled||sourceAssembly?.id===value.sourceClosing.id,'CAMT_PAGE_REVIEW_REQUIRED','Review the complete retained page assembly before closing.');
    const imported=record(bank.imports,assembled?sourceAssembly.selection.importIds[0]:value.sourceClosing.importId,'statement import');
    need(imported.accountId===account.id,'BANK_CLOSE_ACCOUNT','Choose closing balances for the same account.');
    const selected=assembled?sourceAssembly.closing:imported.balances.closing.find(row=>row.id===value.sourceClosing.id);
    need(selected?.eligible&&selected.opening&&selected.closing,'BANK_CLOSE_SOURCE_REQUIRED','Choose a complete original opening and closing balance pair.');
    need(selected.currency===account.currency.code&&selected.from===from&&selected.until===until&&
      minor(selected.opening.amount,account.currency,'source opening',{signed:true})===opening&&
      minor(selected.closing.amount,account.currency,'source closing',{signed:true})===closing,
      'BANK_CLOSE_SOURCE_CHANGED','The dates and balances must match the selected original closing record.',409);
    sourceClosing={importId:imported.id,fileSha256:imported.file.sha256,closing:clone(selected),
      ...(assembled?{kind:'CAMT_PAGE_ASSEMBLY',importIds:clone(sourceAssembly.selection.importIds),assembly:clone(sourceAssembly)}:{})};
  }
  const rows=bank.transactions.filter(row=>row.accountId===account.id&&(!row.postedDate||row.postedDate>=from&&row.postedDate<=until));
  const pending=bank.imports.filter(row=>row.accountId===account.id).flatMap(row=>row.pendingRows.map(item=>({...clone(item),importId:row.id})))
    .filter(row=>!row.postedDate||row.postedDate>=from&&row.postedDate<=until);
  const posted=rows.filter(row=>row.status==='POSTED');
  const problems=[];
  if(sourceAssembly) {
    const claimed=new Map(),sourceRows=new Map();
    for(const row of posted)for(const copy of row.copies) {
      const key=copy.importId+':'+copy.sourceRowId,group=sourceRows.get(key)??new Map();
      group.set(row.id,row);sourceRows.set(key,group);
    }
    for(const entry of sourceAssembly.entries.filter(row=>row.status==='POSTED')) {
      const candidates=[...(sourceRows.get(entry.importId+':'+entry.sourceRowId)?.values()??[])];
      const current=candidates.length===1?candidates[0]:null;
      if(!current||current.currency!==entry.currency||current.postedDate!==entry.postedDate||
        minor(current.sourceAmount,account.currency,'current original entry',{signed:true})!==minor(entry.amount,account.currency,'selected original entry',{signed:true})||
        amountOf(current,account)!==minor(entry.amount,account.currency,'selected account entry',{signed:true}))
        problems.push({code:'CAMT_ASSEMBLED_ENTRY_CHANGED',importId:entry.importId,sourceRowId:entry.sourceRowId,
          message:'Each selected original booked entry must retain exactly one current posted transaction with its original account amount and date.'});
      if(current) {
        if(claimed.has(current.id))problems.push({code:'CAMT_ASSEMBLED_ENTRY_REUSED',transactionId:current.id,
          message:'Two selected original entries resolve to the same posted cash transaction. Review their source identities.'});
        else claimed.set(current.id,entry);
      }
    }
  }
  for(const row of rows) if(!['POSTED','DUPLICATE','SUPERSEDED','DELETED','EXCLUDED'].includes(row.status))
    problems.push({code:'TRANSACTION_REVIEW',transactionId:row.id,status:row.status,message:'Review the original transaction.'});
  let incoming=0n,outgoing=0n;
  const matches=[];
  for(const row of posted) {
    const amount=amountOf(row,account);if(amount>=0n)incoming+=amount;else outgoing+=-amount;
    const match=activeMatch(bank,row.id);
    if(!match){problems.push({code:'UNMATCHED_TRANSACTION',transactionId:row.id,message:'Match or classify every posted transaction.'});continue;}
    if(match.sourceFingerprint!==row.financialSha256)problems.push({code:'MATCH_SOURCE_CHANGED',transactionId:row.id,message:'Review the changed source transaction.'});
    const receiptParts=match.parts.filter(part=>part.kind==='RECEIPT');
    if(receiptParts.length)try {
      const entry=statementSourceEntry(data,account,row);
      need(entry,'BANK_INTAKE_ACCOUNT_MISSING','Restore the original receipt account binding.',409);
      const sourceMatches=bankSourceMatches(data,entry.bankImport,entry.row),groups=new Map();
      for(const part of receiptParts)groups.set(part.targetId,(groups.get(part.targetId)??0n)+BigInt(part.minorAmount));
      for(const [receiptId,units] of groups) {
        const receipt=record(data.receipts,receiptId,'receipt'),
          prior=match.receiptCoverage?.find(item=>item.receiptId===receiptId);
        sourceCoverageReview(receipt,entry.bankImport,entry.row,sourceMatches,money(units,account.currency),
          prior?.distinctPaymentReason??'',receipt.bankSources??[],prior?.review?.key??null);
      }
    } catch(error) {
      problems.push({code:'RECEIPT_SOURCE_COVERAGE_CHANGED',transactionId:row.id,
        sourceCode:error.code??'BANK_SOURCE_COVERAGE_CHANGED',message:error.message});
    }
    let total=0n;
    for(const part of match.parts) {
      total+=BigInt(part.minorAmount);
      if(part.kind==='RECEIPT') {
        const receipt=data.receipts.find(item=>item.id===part.targetId);
        if(!receipt||currencyKey(receipt.currency)!==currencyKey(account.currency)||
          receipt.voidDate&&receipt.voidDate<=until||
          targetUsed(bank,'RECEIPT',part.targetId)>minor(receipt.amount,account.currency))
          problems.push({code:'RECEIPT_CHANGED',transactionId:row.id,receiptId:part.targetId,message:'Review the original receipt and its bank matches.'});
      } else if(part.kind==='REFUND') {
        const refund=(data.refunds??[]).find(item=>item.id===part.targetId);
        const summary=refund?refundAccountSummary(refund,'9999-12-31'):null;
        if(!summary||summary.effectiveStatus!=='RECORDED'||currencyKey(summary.currency)!==currencyKey(account.currency)||
          -targetUsed(bank,'REFUND',part.targetId)>minor(summary.refunded,account.currency))
          problems.push({code:'REFUND_CHANGED',transactionId:row.id,refundId:part.targetId,message:'Review the original refund and its bank matches.'});
      }
    }
    if(total!==amount)problems.push({code:'MATCH_DIFFERENCE',transactionId:row.id,message:'Posting parts differ from the source amount.'});
    matches.push(clone(match));
  }
  const calculated=opening+incoming-outgoing,difference=closing-calculated;
  if(difference!==0n)problems.push({code:'BANK_BALANCE_DIFFERENCE',amount:money(difference,account.currency),
    message:'Opening balance plus posted credits less posted debits differs from the closing balance.'});
  const overlaps=activeCloses(bank,account.id).filter(row=>row.from<=until&&row.until>=from);
  if(overlaps.length)problems.push({code:'BANK_CLOSE_OVERLAP',closeIds:overlaps.map(row=>row.id),message:'Reopen overlapping closes before retaining a replacement.'});
  const prior=activeCloses(bank,account.id).filter(row=>row.until<from).sort((a,b)=>b.until.localeCompare(a.until))[0];
  if(prior) {
    const next=new Date(prior.until+'T00:00:00Z'); next.setUTCDate(next.getUTCDate()+1);
    if(next.toISOString().slice(0,10)===from&&minor(prior.closingBalance,account.currency,'previous closing',{signed:true})!==opening)
      problems.push({code:'BANK_OPENING_CONTINUITY',closeId:prior.id,message:'The opening balance differs from the immediately preceding saved close.'});
  }
  const following=activeCloses(bank,account.id).filter(row=>row.from>until).sort((a,b)=>a.from.localeCompare(b.from))[0];
  if(following) {
    const next=new Date(until+'T00:00:00Z'); next.setUTCDate(next.getUTCDate()+1);
    if(next.toISOString().slice(0,10)===following.from&&minor(following.openingBalance,account.currency,'following opening',{signed:true})!==closing)
      problems.push({code:'BANK_CLOSING_CONTINUITY',closeId:following.id,message:'The closing balance differs from the immediately following saved close.'});
  }
  const imports=bank.imports.filter(row=>row.accountId===account.id&&rows.some(tx=>tx.copies.some(copy=>copy.importId===row.id)));
  for(const id of sourceClosing?.importIds??(sourceClosing?[sourceClosing.importId]:[]))
    if(!imports.some(row=>row.id===id))imports.push(record(bank.imports,id,'statement import'));
  const report={schema:BANK_CLOSE_SCHEMA,account:clone(account),from,until,currency:clone(account.currency),
    openingBalance:money(opening,account.currency),incoming:money(incoming,account.currency),outgoing:money(outgoing,account.currency),
    calculatedClosing:money(calculated,account.currency),closingBalance:money(closing,account.currency),difference:money(difference,account.currency),
    balanceBasis:sourceClosing?.kind==='CAMT_PAGE_ASSEMBLY'?'ORIGINAL_SOURCE_PAGE_ASSEMBLY':sourceClosing?'ORIGINAL_SOURCE_CLOSING':'OPERATOR_ENTERED_STATEMENT_BALANCES',
    balanceNote:field(value.balanceNote??'','balance source and period note',4000,true),sourceClosing,periodClose:clone(periodClose),
    transactions:rows.map(clone),matches,pending,imports:imports.map(importSummary),
    priorCloseId:prior?.id??null,problems,ready:problems.length===0};
  need(sourceClosing||report.balanceNote.length>0,'BANK_BALANCE_SOURCE_REQUIRED','Describe the original statement supplying these period dates and opening/closing balances.');
  report.reviewSha256=sha(json(report));return report;
}
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function closeDocuments(report,snapshot) {
  const rows=[['transaction_id','posted_date','payee','reference','source_currency','source_amount','account_currency','account_amount','status','included_in_totals','provider_id','imports','match_id'],
    ...report.transactions.map(row=>[row.id,row.postedDate,row.payee,row.reference,row.currency,row.amount,
      report.currency.code,row.valuation?.amount??row.amount,row.status,row.status==='POSTED',row.providerId,row.copies.map(copy=>copy.importId).join(' '),
      report.matches.find(match=>match.transactionId===row.id)?.id??''])];
  const postings=[['match_id','transaction_id','kind','target_id','currency','amount','reference','accounting_code','note'],
    ...report.matches.flatMap(match=>match.parts.map(part=>[match.id,match.transactionId,part.kind,part.targetId,report.currency.code,part.amount,part.reference,part.ledgerCode,part.note]))];
  const e=escape;
  const html='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<title>Bank reconciliation — '+e(report.account.name)+'</title><style>body{font:14px system-ui;color:#202020;background:#fff;margin:32px;line-height:1.5}main{max-width:1100px;margin:auto}h1{font-size:26px}h2{font-size:18px}table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}th,td{border:1px solid #bbb;padding:7px;text-align:left;vertical-align:top}th{background:#eee}code{overflow-wrap:anywhere}.amount{text-align:right;white-space:nowrap}p{max-width:85ch}@media print{body{margin:12mm}thead{display:table-header-group}tr{break-inside:avoid}}</style></head><body><main>'+
    '<h1>Bank reconciliation</h1><p><strong>'+e(report.account.name)+'</strong> · '+e(report.from)+' through '+e(report.until)+' · '+e(report.currency.code)+'</p>'+
    '<table><tbody>'+[['Opening balance',report.openingBalance],['Posted credits',report.incoming],['Posted debits',report.outgoing],
      ['Calculated closing balance',report.calculatedClosing],['Statement closing balance',report.closingBalance],['Difference',report.difference]]
      .map(([label,value])=>'<tr><th>'+e(label)+'</th><td class="amount">'+e(value)+'</td></tr>').join('')+'</tbody></table>'+
    '<p>'+e(report.balanceNote)+'</p>'+ (report.sourceClosing?.kind==='CAMT_PAGE_ASSEMBLY'?
      '<h2>Original statement pages</h2><p>'+e(report.sourceClosing.assembly.grouping.basis.replaceAll('_',' '))+
      ' · '+e(report.sourceClosing.assembly.grouping.note)+'</p><table><thead><tr><th>Page</th><th>Original file / statement</th><th>Opening</th><th>Booked movement</th><th>Closing</th></tr></thead><tbody>'+
      report.sourceClosing.assembly.pages.map(page=>'<tr><td>'+e(page.pagination.page)+(page.pagination.last?' · final':'')+
        '</td><td>'+e(page.file.name)+'<br>'+e(page.originalStatementId)+'</td><td>'+e(page.opening?.amount)+
        '</td><td>'+e(page.bookedNet)+'</td><td>'+e(page.closing?.amount)+'</td></tr>').join('')+'</tbody></table>':'')+
      '<h2>Statement transactions</h2><table><thead><tr><th>Date</th><th>Payee / reference</th><th>Account amount</th><th>Review</th></tr></thead><tbody>'+
    report.transactions.map(row=>'<tr><td>'+e(row.postedDate)+'</td><td>'+e(row.payee)+'<br>'+e(row.reference)+'</td><td class="amount">'+
      e(row.valuation?.amount??row.amount)+'</td><td>'+e(row.status)+'</td></tr>').join('')+
    '</tbody></table><h2>Accountant posting parts</h2><table><thead><tr><th>Kind</th><th>Original record</th><th>Amount</th><th>Note</th></tr></thead><tbody>'+
    report.matches.flatMap(match=>match.parts.map(part=>'<tr><td>'+e(part.kind)+'</td><td>'+e(part.target?.reference??part.reference??part.targetId)+
      '</td><td class="amount">'+e(part.amount)+'</td><td>'+e(part.note)+'</td></tr>')).join('')+
    '</tbody></table><p>Pending bank entries: '+report.pending.length+'. Original files, excluded/duplicate/corrected rows, exact postings and the editable reconciliation are included in the complete archive.</p>'+
    '<p>Review <code>'+e(report.reviewSha256)+'</code></p></main></body></html>\n';
  return [
    {name:'reconciliation.json',type:'application/json',bytes:Buffer.from(json(report))},
    {name:'transactions.csv',type:'text/csv; charset=utf-8',bytes:Buffer.from(csv(rows))},
    {name:'posting-parts.csv',type:'text/csv; charset=utf-8',bytes:Buffer.from(csv(postings))},
    {name:'reconciliation.html',type:'text/html; charset=utf-8',bytes:Buffer.from(html)},
    {name:'editable-reconciliation.json',type:'application/json',bytes:Buffer.from(json(snapshot))}
  ];
}
