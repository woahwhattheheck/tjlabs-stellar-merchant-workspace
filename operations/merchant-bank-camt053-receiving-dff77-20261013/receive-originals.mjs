import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {readBankStatementSource} from './source.mjs';
import assert from 'node:assert/strict';
const inputs=JSON.parse(readFileSync(new URL('./inputs.json',import.meta.url),'utf8'));
const results=[];let failures=0;
const shortIssue=x=>({code:x.code,severity:x.severity,message:x.message,source:x.source,details:x.details});
for(const input of inputs){
 const bytes=readFileSync(new URL(input.local,import.meta.url));const out={name:input.name,label:input.label,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),sourceKind:input.sourceKind};
 try{
  const report=readBankStatementSource({format:'CAMT053',file:{name:input.name,dataBase64:bytes.toString('base64')},accountNamespace:input.accountNamespace||'NORDEA-ISSUED-EXAMPLES',camt:{detailPolicy:'ENTRY_CURRENCY_TX_AMT',...input.camt}});
  if(input.expectedRejection)throw new Error('Expected original-source condition was not retained');
  assert.equal(report.file.sha256,out.sha256);assert.equal(report.bytes.compare(bytes),0);assert.equal(report.statements.length,input.expected.statements.length);
  assert.equal(report.camt.messageVersion,input.expected.messageVersion);
  let received=0,details=0,sourceRanges=0;
  for(let si=0;si<report.statements.length;si++){
   const actual=report.statements[si],expected=input.expected.statements[si];
   const rows=[...actual.rows,...actual.pendingRows,...actual.excludedRows.map(x=>x.row)].sort((a,b)=>a.source.charStart-b.source.charStart);
   assert.equal(rows.length,expected.entries.length,'Every Ntry must be retained once');
   for(let ei=0;ei<rows.length;ei++){
    const row=rows[ei],original=expected.entries[ei];
    assert.equal(row.amount,original.amount,'Original entry direction/amount');
    assert.equal(row.currency,original.currency);assert.equal(row.camt.creditDebit,original.direction);
    assert.equal(row.camt.reversal,original.reversal);assert.equal(row.camt.status.code,original.status);
    assert.equal(row.camt.entryReference,original.entryReference);assert.equal(row.camt.accountServicerReference,original.accountServicerReference);
    assert.equal(row.camt.details.length,original.detailCount);
    assert.equal(row.providerId,original.accountServicerReference&&!['NOTPROVIDED','NONREF'].includes(original.accountServicerReference)?original.accountServicerReference:null);
    assert.equal(row.correction,null);assert.equal(row.availableDate,null);
    assert.ok(/^<(?:[A-Za-z_][\w.-]*:)?Ntry(?:\s|>)/.test(bytes.subarray(row.source.byteStart,row.source.byteEnd).toString('utf8')),'Original entry byte range');
    assert.ok(row.source.byteStart>=0&&row.source.byteEnd<=bytes.length);
    assert.ok(row.source.charStart>=0&&row.source.charEnd>row.source.charStart);
    if(original.status==='BOOK')assert.equal(row.status,'POSTED');else if(original.status==='PDNG')assert.equal(row.status,'PENDING');else assert.equal(row.status,'UNMAPPED');
    if(original.bookingDate)assert.equal(row.postedDate,original.bookingDate);
    received++;details+=row.camt.details.length;sourceRanges++;
   }
   for(const expectedTotal of expected.bookedTotals){
    const actualTotal=actual.summary.currencyTotals.find(t=>t.currency===expectedTotal.currency);
    assert.ok(actualTotal,'Original booked currency total');assert.equal(actualTotal.net,expectedTotal.net);
   }
   if(!expected.hasPeriod)for(const pair of actual.balances.closing)assert.equal(pair.eligible,false,'A source without complete period cannot close the account');
  }
  out.status='PASS';out.statementCount=report.statements.length;out.entryCount=received;out.detailCount=details;out.checkedEntrySourceRanges=sourceRanges;
  out.messageVersion=report.camt.messageVersion;out.nodeCount=report.camt.nodeCount;
  out.issues=report.issues.map(shortIssue);
  out.statements=report.statements.map(s=>({id:s.id,accountId:s.account.accountId,currency:s.account.currency,identity:s.account.identityBasis,period:s.period,summary:s.summary,issues:s.issues.map(shortIssue),closing:s.balances.closing.map(c=>({id:c.id,eligible:c.eligible,from:c.from,until:c.until,opening:c.opening,closing:c.closing,issues:c.issues.map(shortIssue)})),balanceCheck:s.camt.balanceCheck,summaryChecks:s.camt.summaryChecks,rows:[...s.rows,...s.pendingRows,...s.excludedRows.map(x=>x.row)].sort((a,b)=>a.source.charStart-b.source.charStart).map(r=>({id:r.id,amount:r.amount,currency:r.currency,status:r.status,eligible:r.eligible,entryReference:r.camt.entryReference,accountServicerReference:r.camt.accountServicerReference,reversal:r.camt.reversal,detailCount:r.camt.details.length,detailTieOut:r.camt.detailTieOut,issues:r.issues.map(shortIssue)}))}));
  const {bytes:retainedOriginal,...serializable}=report;
  const reportBytes=Buffer.from(JSON.stringify(serializable),'utf8');
  out.report={name:'reports/'+input.label+'.json',bytes:reportBytes.length,sha256:createHash('sha256').update(reportBytes).digest('hex')};
  if(input.expectedReportIdentity){assert.equal(out.report.bytes,input.expectedReportIdentity.bytes);assert.equal(out.report.sha256,input.expectedReportIdentity.sha256);out.report.exactRetainedReportMatch=true;}
  writeFileSync(new URL('./reports/'+input.label+'.json',import.meta.url),reportBytes);
 }catch(error){
  out.error={name:error.name,code:error.code,message:error.message,details:error.details,stack:error.stack};
  if(input.expectedRejection&&error.code===input.expectedRejection.code){out.status='SOURCE_REQUIRES_REVIEW';out.originalSourceCondition=input.expectedRejection.condition;}
  else{failures++;out.status='FAIL';}
 }
 results.push(out);
}
writeFileSync(new URL('./receiving-result.json',import.meta.url),JSON.stringify({schema:'stellar-forge.camt053.original-source-receiving.v1',runtime:process.version,files:results,failures},null,2)+'\n');
console.log(JSON.stringify({schema:'stellar-forge.camt053.original-source-receiving.v1',runtime:process.version,files:results.map(x=>({...x,statements:x.statements?.map(s=>({...s,closing:s.closing?.map(c=>({...c,opening:c.opening?{amount:c.opening.amount,asOf:c.opening.asOf}:null,closing:c.closing?{amount:c.closing.amount,asOf:c.closing.asOf}:null}))}))})),failures}));
process.exitCode=failures?1:0;
