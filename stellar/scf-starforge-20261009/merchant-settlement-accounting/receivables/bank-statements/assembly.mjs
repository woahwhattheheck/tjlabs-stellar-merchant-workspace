// SPDX-License-Identifier: MIT
// Complete statement review from retained original CAMT pages; the accounting writer stays in store.mjs.
import {need,plain,field,minor,money,json,sha} from '../core.mjs';
export const CAMT_ASSEMBLY_SCHEMA='stellar-forge.merchant-camt-page-assembly.v1';
const copy=value=>structuredClone(value);
const errors=items=>(items??[]).filter(item=>item.severity==='ERROR');
const originalRows=statement=>[...statement.rows,...statement.pendingRows,...statement.excludedRows.map(item=>item.row??item).filter(item=>item.camt)];
const balanceCode=balance=>balance.camt?.type?.kind==='CODE'?balance.camt.type.value:null;
const cleanTree=node=>node?{name:node.name,text:node.text,attributes:(node.attributes??[]).map(attribute=>({name:attribute.name,namespace:attribute.namespace,value:attribute.value})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),children:(node.children??[]).map(cleanTree)}:null;
function temporalOrder(a, b) {
    if (!a || !b) return null;
    if (!a.time && !b.time) return a.date.localeCompare(b.date);
    if (!a.time || !b.time) return a.date === b.date ? null : a.date.localeCompare(b.date);
    if (a.offsetExplicit !== b.offsetExplicit) return null;
    const comparable = value => {
      const [clock, fraction = ''] = value.time.split('.');
      const [hours, minutes, seconds] = clock.split(':').map(Number);
      const midnight = BigInt(Date.parse(value.date + 'T00:00:00Z') / 1000);
      return (midnight + BigInt(hours * 3600 + minutes * 60 + seconds - (value.offsetMinutes || 0) * 60)) * 1000000000n + BigInt(fraction.padEnd(9, '0'));
    };
    const da = comparable(a), db = comparable(b);
    return da < db ? -1 : da > db ? 1 : 0;
  }
const periodKey=period=>JSON.stringify({from:period?.from,until:period?.until,rawFrom:period?.rawFrom,rawUntil:period?.rawUntil});
const where=(page,source)=>({importId:page.importId,fileSha256:page.file.sha256,statementId:page.statement.id,source:copy(source)});
/**
 * pages are read by the store from its hash-verified parsed.json files, never accepted from a client.
 * Each item is {importId,file,reviewSha256,reportIssues,message,statement}.
 */
export function assembleCamtPages(account,pages,options={}) {
  need(Array.isArray(pages)&&pages.length>0&&pages.length<=1000,'CAMT_PAGE_SELECTION_REQUIRED','Select one to 1,000 retained original statement pages.');
  need(plain(options),'INVALID_CAMT_ASSEMBLY','Provide the complete page-review options.');
  const groupingNote=field(options.groupingNote??'','statement grouping explanation',4000,true);
  const summaryScope=options.summaryScope??'STATEMENT';
  need(['STATEMENT','PAGE'].includes(summaryScope),'CAMT_SUMMARY_SCOPE','Select the original bank summary scope: STATEMENT or PAGE.');
  if(summaryScope==='PAGE')need(groupingNote,'CAMT_SUMMARY_SCOPE_NOTE','Describe the original bank convention supplying a separate summary on each page.');
  const issues=[],add=(code,message,page=null,extra={},severity='ERROR')=>issues.push({code,message,severity,...(page?{importId:page.importId}:{}),...extra});
  const inputIds=pages.map(page=>page.importId);
  need(new Set(inputIds).size===inputIds.length,'CAMT_REPEATED_IMPORT','Select each retained original import once.');
  for(const page of pages) {
    need(page.statement?.kind==='CAMT_STATEMENT'&&page.message?.schema&&page.file?.sha256,
      'CAMT_ORIGINAL_PAGE_REQUIRED','Every selected import must retain an original CAMT statement and message.');
    if(page.statement.account.identitySha256!==account.sourceIdentitySha256||page.statement.account.currency!==account.currency.code)
      add('CAMT_ASSEMBLY_ACCOUNT','The original institution, account and currency must match the selected saved account.',page);
    if(errors(page.reportIssues).length||errors(page.statement.issues).length)
      add('CAMT_ASSEMBLY_SOURCE_ISSUES','Review the original message or statement source errors.',page,{sourceIssues:copy([...errors(page.reportIssues),...errors(page.statement.issues)])});
    const pagination=page.statement.camt?.pagination;
    if(!pagination||!Number.isSafeInteger(pagination.page)||pagination.page<1||typeof pagination.last!=='boolean')
      add('CAMT_PAGE_NUMBER_REQUIRED','Every selected original page needs its page number and last-page indicator.',page);
  }
  pages=[...pages].sort((a,b)=>(a.statement.camt?.pagination?.page??0)-(b.statement.camt?.pagination?.page??0)||a.importId.localeCompare(b.importId));
  const first=pages[0],last=pages.at(-1),period=first.statement.period;
  const namespace=first.message.namespace,version=first.message.messageVersion;
  const level=first.statement.camt?.statementPagination?'STATEMENT':'MESSAGE';
  const sourceKeys=new Set(),numberOwners=new Map();
  for(const page of pages) {
    const statement=page.statement,pagination=statement.camt?.pagination;
    if(page.message.namespace!==namespace||page.message.messageVersion!==version)
      add('CAMT_PAGE_VERSION_CHANGED','Pages must use the same original CAMT namespace and message version.',page);
    if((statement.camt?.statementPagination?'STATEMENT':'MESSAGE')!==level)
      add('CAMT_PAGE_LEVEL_CHANGED','The original statement cannot mix message-level and statement-level pagination.',page);
    if(periodKey(statement.period)!==periodKey(period))
      add('CAMT_PAGE_PERIOD_CHANGED','Pages must retain identical original reporting-period bounds, including their source timestamps.',page);
    const key=page.file.sha256+':'+statement.id;
    if(sourceKeys.has(key))add('CAMT_PAGE_SOURCE_REPEATED','The same original file and statement section is selected more than once.',page);
    sourceKeys.add(key);
    if(pagination) {
      if(numberOwners.has(pagination.page))add('CAMT_PAGE_NUMBER_REPEATED','Choose one original interpretation for each page number.',page,{otherImportId:numberOwners.get(pagination.page),page:pagination.page});
      else numberOwners.set(pagination.page,page.importId);
    }
  }
  const pageNumbers=pages.map(page=>page.statement.camt?.pagination?.page??null),finalPage=last.statement.camt?.pagination?.page??null;
  const missing=[];
  if(Number.isSafeInteger(finalPage)&&finalPage<=1000)for(let page=1;page<=finalPage;page++)if(!numberOwners.has(page))missing.push(page);
  if(pageNumbers.some((number,index)=>number!==index+1))
    add('CAMT_PAGE_COVERAGE','Supply exactly one original page for every number from one through the last page.',null,{pageNumbers,missingPages:missing});
  if(pages.some((page,index)=>page.statement.camt?.pagination?.last!==(index===pages.length-1)))
    add('CAMT_LAST_PAGE_SEQUENCE','Only the final selected original page may say it is the last page; the final page must say true.');
  if(!period?.from||!period?.until||!period.rawFrom||!period.rawUntil)
    add('CAMT_ASSEMBLY_PERIOD_REQUIRED','The complete statement needs its original FrToDt reporting period.');
  if(period?.from>period?.until||temporalOrder(period?.fromDateTime,period?.untilDateTime)===1)add('CAMT_ASSEMBLY_PERIOD_ORDER','The original reporting period is reversed.');
  const sequence={};
  for(const key of ['electronic','legal']) {
    const values=pages.map(page=>page.statement.camt?.sequences?.[key]||null);
    if(values.some(Boolean)) {
      if(!values.every(value=>value===values[0]&&value!==null))
        add('CAMT_PAGE_SEQUENCE_CHANGED','All supplied original '+key+' sequence numbers must agree and be present on every page.',null,{sequenceKind:key,values});
      sequence[key]=values[0];
    }
  }
  const reporting=pages.map(page=>JSON.stringify(cleanTree(page.statement.camt?.sequences?.reporting)));
  if(reporting.some(value=>value!=='null')) {
    if(!reporting.every(value=>value===reporting[0]))add('CAMT_REPORTING_SEQUENCE_CHANGED','Original reporting sequences differ across the selected pages.');
    sequence.reporting=cleanTree(first.statement.camt?.sequences?.reporting);
  }
  const statementIds=pages.map(page=>page.statement.camt.statementId);
  const commonStatementId=statementIds.every(id=>id&&id===statementIds[0])?statementIds[0]:null;
  const groupingBasis=Object.keys(sequence).length?'ORIGINAL_SEQUENCE':commonStatementId?'ORIGINAL_STATEMENT_ID':'REVIEWED_ACCOUNT_AND_PERIOD';
  if(groupingBasis==='REVIEWED_ACCOUNT_AND_PERIOD'&&!groupingNote)
    add('CAMT_PAGE_GROUPING_REVIEW','This bank changes statement identifiers between pages and supplies no common sequence. Explain the reviewed original account-period grouping.');
  const rowsByPage=pages.map(page=>originalRows(page.statement)),allRows=rowsByPage.flat();
  need(allRows.length<=50000,'CAMT_ASSEMBLY_ROW_LIMIT','Review at most 50,000 original entries in one assembled statement.',413);
  const nativeKeys=new Map(),entryBindings=[];
  for(let index=0;index<pages.length;index++) {
    const page=pages[index];
    for(const row of rowsByPage[index]) {
      entryBindings.push({importId:page.importId,sourceRowId:row.id,providerKey:row.providerKey??null,status:row.status,amount:row.amount,currency:row.currency,postedDate:row.postedDate,source:copy(row.source)});
      if(row.status==='POSTED'&&(!row.eligible||errors(row.issues).length))
        add('CAMT_ASSEMBLY_ENTRY_REVIEW','An original booked entry needs source review.',page,{sourceRowId:row.id,sourceIssues:copy(errors(row.issues))});
      if(row.status==='UNMAPPED'&&row.camt?.status?.code!=='INFO')
        add('CAMT_ASSEMBLY_ENTRY_STATUS','Resolve the original non-informational entry status.',page,{sourceRowId:row.id});
      if(row.status==='POSTED'&&row.postedDate&&period?.from&&period?.until&&(row.postedDate<period.from||row.postedDate>period.until))
        add('CAMT_ASSEMBLY_ENTRY_PERIOD','An original booked entry lies outside the complete statement period.',page,{sourceRowId:row.id});
      if(row.providerKey) {
        const prior=nativeKeys.get(row.providerKey);
        if(prior&&prior.importId!==page.importId)add('CAMT_ENTRY_ACROSS_PAGES','The same account-servicer transaction identity occurs on different pages. Receive the correct original page set.',page,{sourceRowId:row.id,other:prior});
        else nativeKeys.set(row.providerKey,{importId:page.importId,sourceRowId:row.id});
      }
    }
  }
  const units=(amount,page,label)=>{
    try{return minor(amount,account.currency,label,{signed:true});}
    catch(error){add('CAMT_ASSEMBLY_AMOUNT',error.message,page,{amount,label});return null;}
  };
  const sumRows=(rows,page)=>{
    let amount=0n;
    for(const row of rows) {
      if(row.currency!==account.currency.code){add('CAMT_ASSEMBLY_ENTRY_CURRENCY','An original entry has another currency.',page,{sourceRowId:row.id,currency:row.currency});return null;}
      const value=units(row.amount,page,'original entry amount');if(value===null)return null;amount+=value;
    }
    return amount;
  };
  const pageReviews=[],transitions=[];
  let previousClosing=null,totalBooked=0n,completeBooked=true;
  for(let index=0;index<pages.length;index++) {
    const page=pages[index],statement=page.statement,firstPage=index===0,final=index===pages.length-1;
    const booked=rowsByPage[index].filter(row=>row.status==='POSTED'),net=sumRows(booked,page);
    if(net===null)completeBooked=false;else totalBooked+=net;
    const balances=(statement.balances.sourceBalances??[]).filter(balance=>balance.currency===account.currency.code&&!errors(balance.issues).length&&balance.amount!==null);
    const openings=balances.filter(balance=>firstPage?balanceCode(balance)==='OPBD'&&!balance.camt.intermediate:
      balanceCode(balance)==='OPBD'&&balance.camt.intermediate);
    const closings=balances.filter(balance=>final?balanceCode(balance)==='CLBD'&&!balance.camt.intermediate:
      balanceCode(balance)==='CLBD'&&balance.camt.intermediate);
    const pairs=[];
    for(const opening of openings)for(const closing of closings) {
      if(opening.source.pointer===closing.source.pointer)continue;
      const start=units(opening.amount,page,'original opening boundary'),end=units(closing.amount,page,'original closing boundary');
      if(start===null||end===null||net===null||start+net!==end)continue;
      if(previousClosing&&units(previousClosing.balance.amount,page,'preceding original closing')!==start)continue;
      if(temporalOrder(opening.asOf,closing.asOf)===1)continue;
      if(previousClosing&&temporalOrder(previousClosing.balance.asOf,opening.asOf)===1)continue;
      pairs.push({opening,closing});
    }
    const pair=pairs.length===1?pairs[0]:null;
    if(!pair)add(pairs.length?'CAMT_PAGE_BOUNDARY_AMBIGUOUS':'CAMT_PAGE_BALANCE_CONTINUITY',
      pairs.length?'Several original balance pairs fit this page; review the original bank convention.':'The original opening boundary plus booked page entries must equal its closing boundary and connect to the preceding page.',page,
      {page:statement.camt.pagination?.page,openingCount:openings.length,closingCount:closings.length,matchingPairs:pairs.length,bookedNet:net===null?null:money(net,account.currency)});
    if(pair) {
      if(firstPage&&pair.opening.asOf?.date&&period?.from&&pair.opening.asOf.date>period.from)
        add('CAMT_ASSEMBLY_OPENING_DATE','The first original opening balance follows the reporting-period start.',page);
      if(final&&pair.closing.asOf?.date&&period?.until&&
        (pair.closing.asOf.date<period.from||pair.closing.asOf.date>period.until))
        add('CAMT_ASSEMBLY_CLOSING_DATE','The final original closing balance lies outside the reporting period.',page);
      if(previousClosing)transitions.push({fromImportId:previousClosing.importId,toImportId:page.importId,
        closing:copy(previousClosing.balance),opening:copy(pair.opening),matches:true});
      previousClosing={importId:page.importId,balance:pair.closing};
    } else previousClosing=null;
    pageReviews.push({importId:page.importId,file:copy(page.file),statementId:statement.id,originalStatementId:statement.camt.statementId,
      messageId:page.message.messageId,messageVersion:page.message.messageVersion,reviewSha256:page.reviewSha256,
      pagination:copy(statement.camt.pagination),sequences:copy(statement.camt.sequences),copyDuplicate:statement.camt.copyDuplicate,
      period:copy(statement.period),entryCount:rowsByPage[index].length,bookedCount:booked.length,
      pendingCount:statement.pendingRows.length,bookedNet:net===null?null:money(net,account.currency),
      opening:pair?copy(pair.opening):null,closing:pair?copy(pair.closing):null,
      balanceCheck:pair?'MATCH':'REVIEW',source:where(page,statement.source),sourceIssues:copy(statement.issues)});
  }
  const summaryChecks=[];
  for(let index=0;index<pages.length;index++) {
    const page=pages[index],checks=page.statement.camt.summaryChecks??[];
    if(summaryScope==='STATEMENT'&&index>0&&checks.length)add('CAMT_LATER_PAGE_SUMMARY','A statement-wide summary belongs to its first page. Review the original bank summary convention.',page);
    const rows=summaryScope==='STATEMENT'?allRows:rowsByPage[index];
    for(const control of checks) {
      const group=control.field.split('/')[0],selected=group==='TtlCdtNtries'?rows.filter(row=>row.camt.creditDebit==='CRDT'):
        group==='TtlDbtNtries'?rows.filter(row=>row.camt.creditDebit==='DBIT'):rows;
      let expected=null,matches=false;
      if(control.kind==='COUNT') {expected=String(selected.length);matches=control.reported!==null&&String(control.reported)===expected;}
      else {
        let total=0n,valid=true;
        for(const row of selected) {
          if(row.currency!==account.currency.code){valid=false;break;}
          const amount=units(row.amount,page,'original summary entry amount');if(amount===null){valid=false;break;}
          total+=control.kind==='ABSOLUTE_AMOUNT'&&amount<0n?-amount:amount;
        }
        if(valid) {
          expected=money(total,account.currency);
          const reported=control.reported===null?null:units(control.reported,page,'original reported summary');
          matches=reported!==null&&reported===total;
        }
      }
      const reviewed={...copy(control),importId:page.importId,scope:summaryScope,expected,matches};summaryChecks.push(reviewed);
      if(!matches)add('CAMT_ASSEMBLED_SUMMARY_DIFFERENCE','The original summary differs from the entries in its selected complete scope.',page,{control:reviewed});
    }
  }
  const opening=pageReviews[0].opening,closing=pageReviews.at(-1).closing;
  let difference=null;
  if(opening&&closing&&completeBooked) {
    const start=units(opening.amount,first,'first original opening'),end=units(closing.amount,last,'final original closing');
    if(start!==null&&end!==null){difference=money(end-start-totalBooked,account.currency);
      if(end-start-totalBooked!==0n)add('CAMT_ASSEMBLED_BALANCE_DIFFERENCE','The first original opening plus all booked entries differs from the final original closing.',null,{difference});}
  }
  const selection={accountId:account.id,importIds:pages.map(page=>page.importId),groupingNote,summaryScope};
  const report={schema:CAMT_ASSEMBLY_SCHEMA,accountId:account.id,currency:copy(account.currency),selection,
    grouping:{basis:groupingBasis,sequence,commonStatementId,originalStatementIds:statementIds,note:groupingNote},
    namespace,messageVersion:version,paginationLevel:level,period:copy(period),pages:pageReviews,transitions,summaryChecks,
    entries:entryBindings,entryCount:allRows.length,bookedCount:allRows.filter(row=>row.status==='POSTED').length,
    bookedNet:completeBooked?money(totalBooked,account.currency):null,difference,
    missingPages:missing,issues,eligible:!issues.some(issue=>issue.severity==='ERROR')&&Boolean(opening&&closing)};
  report.id=sha(json(report));
  report.closing={id:report.id,kind:'CAMT_ASSEMBLED_BOOKED_BALANCES',providerId:commonStatementId,
    providerKey:null,currency:account.currency.code,currencyConversion:null,from:period?.from??null,until:period?.until??null,
    opening,closing,dates:{REPORT_FROM:period?.fromDateTime??null,REPORT_UNTIL:period?.untilDateTime??null,
      OPENING_AS_OF:opening?.asOf??null,CLOSING_AS_OF:closing?.asOf??null},totals:{},
    source:{pointerSyntax:'CAMT_RETAINED_PAGE_ASSEMBLY',assemblyId:report.id,imports:copy(report.selection.importIds)},
    original:{opening:opening?.original??null,closing:closing?.original??null},issues:copy(issues),eligible:report.eligible,
    camt:{completeSinglePage:false,completePageAssembly:report.eligible,reportingPeriodBasis:'ORIGINAL_FR_TO_DT',dateBoundary:'INCLUSIVE_SOURCE_CALENDAR',
      pageCount:pages.length,balanceCheck:{status:report.eligible?'MATCH':'REVIEW',difference,scope:'COMPLETE_STATEMENT'}}};
  report.sourceClosing={kind:'CAMT_PAGE_ASSEMBLY',id:report.id,importIds:copy(selection.importIds),groupingNote,summaryScope};
  return report;
}
