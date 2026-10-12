// SPDX-License-Identifier: MIT
// Shared original receipt coverage for the receipt intake and statement reconciliation desks.
import {json,sha,need,identifier,currencyKey,minor,money} from './core.mjs';
const clone=value=>structuredClone(value);
function bankHash(value,label) {
  need(typeof value==='string'&&/^[a-f0-9]{64}$/.test(value),'INVALID_BANK_SOURCE_ID',
    'Choose the retained '+label+'.');return value;
}
export function sourceOccurrenceKey(fileSha256,lineNumber) {
  return /^[a-f0-9]{64}$/.test(fileSha256??'')&&Number.isSafeInteger(lineNumber)&&lineNumber>0?
    sha(json({kind:'BANK_SOURCE_LINE',sha256:fileSha256,line:lineNumber})):null;
}
export function sourceIds(row) { return [...new Set([row.transactionKey,...(row.replacesTransactionKeys??[])].filter(Boolean))]; }
export function bankCoverageKey(link) {
  return link.coverageKey??sha(json({bankAccountId:link.bankAccountId,
    transactionKey:link.transactionKey??null,economicKey:link.transactionKey?null:link.economicKey,
    distinctPaymentId:link.distinctPaymentId??null}));
}
export function receiptCoverageGroups(receipt) {
  const groups=new Map();
  for(const link of receipt.bankSources??[]) {
    const key=bankCoverageKey(link),amount=minor(link.splitAmount,receipt.currency,'original source coverage',{positive:true});
    if(!groups.has(key))groups.set(key,{key,amount,links:[]});
    const group=groups.get(key);
    need(group.amount===amount,'BANK_SOURCE_COVERAGE_CONFLICT',
      'The original receipt retains different covered amounts for one bank payment; correct its retained assignment.',409);
    group.links.push(link);
  }
  const total=[...groups.values()].reduce((sum,row)=>sum+row.amount,0n);
  need(total<=minor(receipt.amount,receipt.currency),'BANK_SOURCE_COVERAGE_EXCEEDED',
    'Retained distinct bank payments exceed the original receipt amount.',409);
  return {groups,total};
}
export function coverageLinksMatch(link,bankImport,row,matches=[],distinctPaymentReason='') {
  if(link.bankAccountId!==bankImport.accountId)return false;
  if(link.bankImportId===bankImport.id&&link.rowId===row.id)return true;
  const keys=new Set(sourceIds(row));
  if(link.transactionKey&&keys.has(link.transactionKey))return true;
  if((link.transactionAliases??[]).some(key=>keys.has(key)))return true;
  const occurrences=new Set([row.sourceOccurrenceKey,...(row.sourceOccurrenceKeys??[])].filter(Boolean));
  if([link.sourceOccurrenceKey,...(link.sourceOccurrenceKeys??[])].some(key=>key&&occurrences.has(key)))return true;
  return matches.some(match=>match.bankImportId===link.bankImportId&&match.rowId===link.rowId&&
    (['TRANSACTION_ID','SOURCE_LINE'].includes(match.match)||!distinctPaymentReason));
}
export function currentReceiptRows(data,id,bankImport=null,sourceRow=null) {
  const found=[],seen=new Set(),queue=[id];
  while(queue.length) {
    const next=queue.shift();
    need(!seen.has(next),'BANK_RECEIPT_HISTORY_INVALID','The original receipt replacement history contains a cycle.',409);
    seen.add(next);
    const row=data.receipts.find(item=>item.id===next);if(!row)continue;
    const successors=[...new Set([...(row.replacementReceiptIds??[]),row.replacedByReceiptId].filter(Boolean))];
    if(successors.length)queue.push(...successors);else found.push(row);
  }
  if(!bankImport||!sourceRow||found.length<=1)return found;
  const keys=new Set(sourceIds(sourceRow));
  return found.filter(receipt=>(receipt.bankSources??[]).some(link=>
    link.bankAccountId===bankImport.accountId&&(
      link.bankImportId===bankImport.id&&link.rowId===sourceRow.id||
      link.transactionKey&&keys.has(link.transactionKey)||
      (link.transactionAliases??[]).some(key=>keys.has(key))||
      !sourceRow.transactionKey&&link.economicKey===sourceRow.economicKey)));
}
export function sourceCoverageReview(receipt,bankImport,row,matches,amount,distinctPaymentReason,plannedLinks,requestedKey=null) {
  const original={...receipt,bankSources:plannedLinks},covered=receiptCoverageGroups(original);
  let related=[...covered.groups.values()].filter(group=>group.links.some(link=>
    coverageLinksMatch(link,bankImport,row,matches,distinctPaymentReason)));
  if(requestedKey) {
    bankHash(requestedKey,'original coverage key');
    related=related.filter(group=>group.key===requestedKey);
    need(related.length===1,'BANK_SOURCE_COVERAGE_NOT_FOUND','Choose an original covered payment for this retained source.',409);
  }
  need(related.length<=1,'BANK_SOURCE_COVERAGE_AMBIGUOUS',
    'Several original payments share these source fields; choose the exact retained coverage key for this source link.',409);
  const units=minor(amount,receipt.currency),prior=related[0],key=prior?.key??bankCoverageKey({
    bankAccountId:bankImport.accountId,transactionKey:row.transactionKey,economicKey:row.economicKey,
    distinctPaymentId:distinctPaymentReason?row.id:row.sourceOccurrenceKey??null});
  if(prior)need(prior.amount===units,'BANK_SOURCE_COVERAGE_CHANGED',
    'A repeated source link must retain its original covered amount; use the reviewed correction for changed bank facts.',409);
  const added=prior?0n:units,after=covered.total+added;
  need(after<=minor(receipt.amount,receipt.currency),'BANK_RECEIPT_COVERAGE_EXCEEDED',
    'Distinct original bank credits exceed the remaining unmatched amount of this receipt.',409);
  return {key,repeatedSource:Boolean(prior),receiptAmount:receipt.amount,
    beforeMatchedAmount:money(covered.total,receipt.currency),coveredByThisSource:amount,
    newlyMatchedAmount:money(added,receipt.currency),afterMatchedAmount:money(after,receipt.currency),
    remainingUnmatchedAmount:money(minor(receipt.amount,receipt.currency)-after,receipt.currency)};
}
export function plannedBankLink(bankImport,row,split,postingId,distinctPaymentReason='') {
  return {bankImportId:bankImport.id,bankAccountId:bankImport.accountId,rowId:row.id,postingId,
    sourceSha256:bankImport.source.sha256,sourceRowSha256:row.sourceRowSha256,
    transactionKey:row.transactionKey,transactionAliases:[...new Set([...sourceIds(row),...(split.sourceCoverage.transactionKeys??[])])],transactionIdentity:row.transactionIdentity,
    economicKey:row.economicKey,sourceOccurrenceKey:row.sourceOccurrenceKey??null,
    sourceOccurrenceKeys:clone(row.sourceOccurrenceKeys??[]),bookedDate:row.bookedDate,sourceAmount:row.amount,
    sourceName:bankImport.source.name,transactionId:row.transactionId,bankReference:row.bankReference,reference:row.reference,
    coverageKey:split.sourceCoverage.key,distinctPaymentId:distinctPaymentReason?row.id:null,
    splitAmount:split.amount,dateDifferenceReason:split.dateDifferenceReason||null};
}

export function bindStatementIntakeAccount(data,account,sourceAccount,actor,at,normalizeBankAccount,selectedId=null) {
  need(sourceAccount?.identitySha256===account.sourceIdentitySha256,'BANK_SOURCE_ACCOUNT_MISMATCH',
    'Choose the original statement account identity.',409);
  const basis=sourceAccount.identityBasis;
  need(basis&&typeof basis.institution==='string'&&typeof basis.accountId==='string',
    'BANK_SOURCE_ACCOUNT_IDENTITY','Retain the original institution and account identity.',409);
  data.bankAccounts??=[];
  const exact=item=>currencyKey(item.currency)===currencyKey(account.currency)&&
    item.bankId===basis.institution&&item.accountReference===basis.accountId;
  let intake=null;
  if(account.receiptIntakeAccountId||selectedId) {
    const id=identifier(account.receiptIntakeAccountId??selectedId,'receipt intake account');
    need(!selectedId||selectedId===id,'BANK_INTAKE_ACCOUNT_REBIND','Keep the saved receipt account binding.',409);
    intake=data.bankAccounts.find(item=>item.id===id);
    need(intake&&exact(intake),'BANK_INTAKE_ACCOUNT_IDENTITY',
      'Choose the receipt account with this original bank identity and currency.',409);
  } else {
    const candidates=data.bankAccounts.filter(item=>exact(item)&&
      (!basis.branchId||item.statementSourceIdentitySha256===account.sourceIdentitySha256));
    need(candidates.length<=1,'BANK_INTAKE_ACCOUNT_AMBIGUOUS',
      'Select the existing receipt intake account for this statement identity.',409);
    intake=candidates[0]??null;
  }
  if(intake) {
    need(!intake.statementSourceIdentitySha256||intake.statementSourceIdentitySha256===account.sourceIdentitySha256,
      'BANK_INTAKE_ACCOUNT_IDENTITY','The receipt account is bound to another original statement identity.',409);
  } else {
    const normalized=normalizeBankAccount({reference:'Statement '+account.id,name:account.name,currency:account.currency,
      bankId:basis.institution,accountReference:basis.accountId,method:'Bank transfer'});
    intake={...normalized,createdAt:at,updatedAt:at,history:[{at,actor,action:'bank_account_created',version:1}]};
    data.bankAccounts.unshift(intake);
  }
  if(!account.receiptIntakeAccountId) {
    account.receiptIntakeAccountId=intake.id;account.sourceIdentity=clone(basis);
    account.history??=[];account.history.push({at,actor,action:'receipt_intake_account_bound',bankAccountId:intake.id});
  }
  if(!intake.statementSourceIdentitySha256) {
    intake.statementSourceIdentitySha256=account.sourceIdentitySha256;
    intake.statementSourceIdentity=clone(basis);
    intake.history??=[];intake.history.push({at,actor,action:'statement_account_bound',statementAccountId:account.id});
  }
  return intake;
}
export function statementSourceEntry(data,account,transaction) {
  const bank=data.bankStatements;
  if(!bank||!account.receiptIntakeAccountId)return null;
  const intake=(data.bankAccounts??[]).find(item=>item.id===account.receiptIntakeAccountId);
  need(intake&&currencyKey(intake.currency)===currencyKey(account.currency),'BANK_INTAKE_ACCOUNT_MISSING',
    'Restore the original receipt intake account binding.',409);
  const copy=transaction.copies?.find(item=>bank.imports.some(source=>source.id===item.importId));
  const imported=bank.imports.find(item=>item.id===copy?.importId);
  if(!imported)return null;
  const units=minor(transaction.valuation?.amount??transaction.amount,account.currency,'bank source amount',{signed:true});
  const amount=money(units,account.currency),providerId=transaction.providerId??null,ancestors=[];
  let predecessor=transaction;const seen=new Set();
  while(predecessor) {
    need(!seen.has(predecessor.id),'BANK_SOURCE_HISTORY_CYCLE','Restore the original bank correction history.',409);
    seen.add(predecessor.id);
    if(predecessor.correction?.providerId)ancestors.push(predecessor.correction.providerId);
    if(!predecessor.supersedesId)break;
    predecessor=bank.transactions.find(item=>item.id===predecessor.supersedesId&&item.accountId===account.id);
    need(predecessor,'BANK_SOURCE_HISTORY_MISSING','Retain the original predecessor of this bank correction.',409);
    if(predecessor.providerId)ancestors.push(predecessor.providerId);
  }
  const transactionKey=providerId?sha(json({accountId:intake.id,transactionId:providerId})):null;
  const occurrenceKeys=[...new Set((transaction.copies??[]).map(item=>{
    const source=bank.imports.find(original=>original.id===item.importId);
    return source?.format==='CSV'?sourceOccurrenceKey(source.file.sha256,item.source?.lineStart):null;
  }).filter(Boolean))];
  const row={id:sha(json({kind:'BANK_STATEMENT_RECONCILIATION_ROW',transactionId:transaction.id})),
    sourceOrigin:'BANK_STATEMENT_RECONCILIATION',statementAccountId:account.id,statementTransactionId:transaction.id,
    rowNumber:copy.source?.recordNumber??null,lineNumber:copy.source?.lineStart??null,
    sourceRowSha256:sha(json({sourceSha256:imported.file.sha256,source:copy.source,
      financialSha256:transaction.financialSha256})),raw:null,bookedDate:transaction.postedDate,
    valueDate:transaction.valueDate??null,amount,currency:clone(account.currency),transactionId:providerId,
    transactionKey,transactionIdentity:providerId?'BANK_TRANSACTION_ID':'NONE',
    replacesTransactionKeys:[...new Set(ancestors)].map(transactionId=>sha(json({accountId:intake.id,transactionId}))),
    reference:transaction.reference??'',counterparty:transaction.payee??'',invoiceReference:'',
    bankReference:transaction.reference??'',narrative:transaction.memo??'',
    sourceOccurrenceKey:occurrenceKeys[0]??null,sourceOccurrenceKeys:occurrenceKeys,
    kind:units>0n?'CREDIT':units<0n?'DEBIT':'ZERO',cashSource:imported.sourceAccount?.kind!=='CREDIT_CARD',
    sourceEligible:transaction.status==='POSTED',requiresSourceResolution:transaction.status!=='POSTED',
    sourceIdentity:{statementSourceIdentity:transaction.sourceIdentity,accountKey:imported.sourceAccount?.accountKey??null,
      currency:account.currency.code,fitid:providerId,correctionAction:transaction.correction?.action??null,
      correctsFitid:transaction.correction?.providerId??null}};
  row.economicKey=sha(json({accountId:intake.id,date:row.bookedDate,amount,currency:row.currency,
    reference:row.reference.trim(),counterparty:row.counterparty.trim(),invoiceReference:''}));
  const match=bank.matches.find(item=>item.transactionId===transaction.id&&!item.undoneAt)??null;
  const created=data.receipts.filter(item=>item.source?.kind==='ORIGINAL_BANK_STATEMENT'&&
    item.source.transactionId===transaction.id&&item.status==='RECORDED'&&
    item.source.sourceFingerprint===transaction.financialSha256);
  const originalIds=match?match.parts.filter(part=>part.kind==='RECEIPT').map(part=>part.targetId):created.map(item=>item.id);
  const receiptIds=[...new Set(originalIds.flatMap(id=>currentReceiptRows(data,id).map(item=>item.id)))];
  let statementReconciliation=null;
  if(match) {
    const adjustments=match.parts.filter(part=>part.kind!=='RECEIPT');
    statementReconciliation={origin:'BANK_STATEMENT_RECONCILIATION',statementAccountId:account.id,
      transactionId:transaction.id,matchId:match.id,matchSha256:sha(json(match)),bankAmount:amount,
      adjustmentAmount:money(adjustments.reduce((sum,part)=>sum+BigInt(part.minorAmount),0n),account.currency),
      adjustments:clone(adjustments),receiptIds,
      receipts:[...new Set(match.parts.filter(part=>part.kind==='RECEIPT').map(part=>part.targetId))].map(receiptId=>({
        receiptId,amount:money(match.parts.filter(part=>part.kind==='RECEIPT'&&part.targetId===receiptId)
          .reduce((sum,part)=>sum+BigInt(part.minorAmount),0n),account.currency),
        coverageKey:match.receiptCoverage?.find(item=>item.receiptId===receiptId)?.review?.key??null}))};
  } else if(created.length===1&&created[0].source.bankAmount===amount) {
    const source=created[0].source,fee=minor(source.feeAmount??'0',account.currency);
    statementReconciliation={origin:'ORIGINAL_BANK_STATEMENT_RECEIPT',statementAccountId:account.id,
      transactionId:transaction.id,matchId:null,matchSha256:sha(json(source)),bankAmount:amount,
      adjustmentAmount:money(-fee,account.currency),adjustments:fee?[{kind:'FEE',
        amount:money(-fee,account.currency),minorAmount:String(-fee),receiptId:created[0].id}]:[],receiptIds,
      receipts:[{receiptId:created[0].id,amount:created[0].amount,coverageKey:null}]};
  }
  row.statementReconciliation=statementReconciliation;
  const source={...clone(imported.file),name:imported.file.name,format:imported.format};
  const decision={rowId:row.id,status:receiptIds.length?'LINKED':'UNASSIGNED',receiptIds,
    sourceOrigin:'BANK_STATEMENT_RECONCILIATION'};
  return {bankImport:{id:imported.id,sourceOrigin:'BANK_STATEMENT_RECONCILIATION',accountId:intake.id,
    account:clone(intake),source,section:{id:imported.statementId,kind:imported.kind},
    status:'OPEN',index:[row],decisions:[decision],postings:[]},row,match};
}
export function statementSourceImports(data) {
  const bank=data.bankStatements;if(!bank)return [];
  const result=new Map();
  for(const transaction of bank.transactions??[]) {
    if(transaction.status!=='POSTED')continue;
    const account=bank.accounts.find(item=>item.id===transaction.accountId);
    if(!account?.receiptIntakeAccountId)continue;
    const entry=statementSourceEntry(data,account,transaction);if(!entry)continue;
    const existing=result.get(entry.bankImport.id);
    if(existing){existing.index.push(entry.row);existing.decisions.push(...entry.bankImport.decisions);}
    else result.set(entry.bankImport.id,entry.bankImport);
  }
  return [...result.values()];
}
export function statementPostingAdjustment(matches,row,currency) {
  const candidates=matches.filter(item=>['TRANSACTION_ID','SOURCE_LINE'].includes(item.match)&&item.sameFacts&&
    item.statementReconciliation&&item.receiptIds.length);
  const unique=new Map(candidates.map(item=>[item.statementReconciliation.matchSha256,item.statementReconciliation]));
  need(unique.size<=1,'BANK_STATEMENT_MATCH_AMBIGUOUS',
    'Review the existing statement matches before linking their original customer receipts.',409);
  const retained=[...unique.values()][0]??null;
  if(retained)need(retained.bankAmount===row.amount&&
    money(minor(retained.adjustmentAmount,currency,'retained bank adjustments',{signed:true}),currency)===retained.adjustmentAmount,
    'BANK_STATEMENT_ADJUSTMENT_CHANGED','Review the original retained bank fee and customer payment.',409);
  return retained?clone(retained):null;
}
export function recordStatementCoverage(data,account,transaction,match,actor,at) {
  const entry=statementSourceEntry(data,account,transaction);
  need(entry,'BANK_INTAKE_ACCOUNT_MISSING','Receive this statement into its original receipt intake account.',409);
  for(const coverage of match.receiptCoverage??[]) {
    const receipt=data.receipts.find(item=>item.id===coverage.receiptId);
    need(receipt,'RECEIPT_NOT_FOUND','Choose the original customer receipt.',404);
    const split={amount:coverage.review.coveredByThisSource,sourceCoverage:coverage.review,dateDifferenceReason:match.reason};
    const link={...plannedBankLink(entry.bankImport,entry.row,split,match.id,coverage.distinctPaymentReason),
      sourceOrigin:'BANK_STATEMENT_RECONCILIATION',statementAccountId:account.id,
      statementTransactionId:transaction.id,statementMatchId:match.id};
    receipt.bankSources??=[];receipt.bankSources.push(link);receiptCoverageGroups(receipt);
    receipt.history??=[];receipt.history.push({at,actor,action:'bank_statement_source_linked',
      bankAccountId:entry.bankImport.accountId,statementAccountId:account.id,statementTransactionId:transaction.id,
      statementMatchId:match.id,coverageKey:coverage.review.key,amount:split.amount});
  }
}
export function releaseStatementCoverage(data,match,actor,at,reason) {
  for(const receipt of data.receipts) {
    const removed=(receipt.bankSources??[]).filter(link=>link.sourceOrigin==='BANK_STATEMENT_RECONCILIATION'&&
      link.statementMatchId===match.id);
    if(!removed.length)continue;
    receipt.bankSources=receipt.bankSources.filter(link=>!removed.includes(link));
    receipt.history??=[];receipt.history.push({at,actor,action:'bank_statement_source_released',
      statementMatchId:match.id,reason,links:clone(removed)});
  }
}
