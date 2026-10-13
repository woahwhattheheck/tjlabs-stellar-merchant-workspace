// MIT. Customer account responses retain the original exported account and ledger basis.
import {need, plain, field, identifier, dateValue, currencyOf, minor, money, json, sha, today, invoiceSummary} from './core.mjs';
import {collectionRows, collectionTerms, collectionDate, projectCollection, normalizeCollectionActivity} from './collections.mjs';

export const CUSTOMER_ACCOUNT_SCHEMA = 'stellar-forge.merchant-customer-account-publication.v1';
export const CUSTOMER_RESPONSE_SCHEMA = 'stellar-forge.merchant-customer-account-response.v1';
export const CUSTOMER_RESPONSE_REVIEW_SCHEMA = 'stellar-forge.merchant-customer-account-response-review.v1';
export const RESPONSE_KINDS = ['NOTE','PROMISE','DISPUTE','PAYMENT_NOTICE'];
export const RESPONSE_DISPOSITIONS = ['RECORD','ACKNOWLEDGE','DECLINE','DEFER'];
export const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const same = (a,b) => json(a) === json(b);
export function customerAccountData(data) {
  need((data.customerAccountPublications===undefined||Array.isArray(data.customerAccountPublications))&&
    (data.customerAccountResponses===undefined||Array.isArray(data.customerAccountResponses)),
    'INVALID_CUSTOMER_ACCOUNT_REGISTER','The original customer account register is invalid.',409);
  return {publications:data.customerAccountPublications ?? [], responses:data.customerAccountResponses ?? []};
}
export function accountPublicationSummary(row) {
  return {schema:row.schema,id:row.id,customerId:row.customerId,customerName:row.account.customer.name,
    asOf:row.asOf,createdAt:row.createdAt,createdBy:row.createdBy,sourceSha256:row.sourceSha256,
    accountSha256:row.accountSha256,invoices:row.account.invoices.length,currencies:row.account.currencies,
    files:Object.keys(row.files)};
}
export function accountResponseSummary(row) {
  const completed = row.decisions.filter(item => item.disposition !== 'DEFER');
  return {id:row.id,publicationId:row.publicationId,customerId:row.customerId,customerName:row.customerName,
    receivedAt:row.receivedAt,receivedBy:row.receivedBy,responseDate:row.response.responseDate,
    author:row.response.author,version:row.version,items:row.response.items.length,
    completed:completed.length,pending:row.response.items.length-completed.length,
    status:completed.length === row.response.items.length?'REVIEWED':'OPEN',sourceSha256:row.sourceSha256};
}
export function normalizeCustomerResponse(value, publication) {
  need(plain(value) && value.schema === CUSTOMER_RESPONSE_SCHEMA,'INVALID_CUSTOMER_RESPONSE','Choose a complete customer account response JSON.');
  const id=identifier(value.id,'response'), account=value.account;
  need(plain(account) && account.publicationId===publication.id && account.workspaceId===publication.workspaceId &&
    account.customerId===publication.customerId && account.sourceSha256===publication.sourceSha256 &&
    account.accountSha256===publication.accountSha256 && account.asOf===publication.asOf,
    'CUSTOMER_RESPONSE_SOURCE_CHANGED','This response belongs to a different original customer account.',409);
  const responseDate=dateValue(value.responseDate,'customer response date');
  need(responseDate>=publication.asOf && responseDate<=today(),'INVALID_CUSTOMER_RESPONSE_DATE',
    'Use a response date between the original account date and today.');
  need(plain(value.author),'CUSTOMER_RESPONSE_AUTHOR_REQUIRED','Retain the customer response author.');
  const author={name:field(value.author.name,'customer name',300),reference:field(value.author.reference??'','customer contact or reference',1000,true)};
  need(Array.isArray(value.items) && value.items.length>0 && value.items.length<=500,'INVALID_CUSTOMER_RESPONSE_ITEMS',
    'Retain one to 500 complete invoice responses.');
  const ids=new Set();
  const items=value.items.map(input=>{
    need(plain(input),'INVALID_CUSTOMER_RESPONSE_ITEM','Each response must be a complete invoice entry.');
    const itemId=identifier(input.id,'response entry'); need(!ids.has(itemId),'DUPLICATE_CUSTOMER_RESPONSE_ITEM','Each response entry needs its own original identifier.');ids.add(itemId);
    const invoice=publication.account.invoices.find(row=>row.id===input.invoiceId);
    need(invoice,'CUSTOMER_RESPONSE_INVOICE_MISMATCH','Choose an invoice from this original customer account.');
    need(RESPONSE_KINDS.includes(input.kind),'INVALID_CUSTOMER_RESPONSE_KIND','Choose a note, payment promise, invoice dispute or payment notice.');
    const item={id:itemId,invoiceId:invoice.id,kind:input.kind,note:field(input.note,'customer message',6000)};
    if(['PROMISE','DISPUTE','PAYMENT_NOTICE'].includes(item.kind)){
      const amount=minor(input.amount,invoice.currency,'customer amount',{positive:true});
      if(item.kind!=='PAYMENT_NOTICE')need(amount<=minor(invoice.amountDue,invoice.currency),'CUSTOMER_RESPONSE_AMOUNT',
        'The proposed amount exceeds this invoice in the selected account. Request a current account if its basis changed.');
      item.amount=money(amount,invoice.currency);
    }
    if(item.kind==='PROMISE'){
      item.dueDate=dateValue(input.dueDate,'promised payment date');
      need(item.dueDate>=responseDate,'INVALID_CUSTOMER_PROMISE_DATE','Choose a promised date on or after this response.');
    }
    if(item.kind==='DISPUTE'){
      need(['PRICING','DELIVERY','DUPLICATE','OTHER'].includes(input.category),'INVALID_CUSTOMER_DISPUTE_CATEGORY','Choose the invoice dispute category.');
      item.category=input.category;
    }
    if(item.kind==='PAYMENT_NOTICE'){
      item.paymentDate=dateValue(input.paymentDate,'reported payment date');
      need(item.paymentDate<=responseDate,'INVALID_CUSTOMER_PAYMENT_DATE','A reported payment date must be on or before the response.');
      item.paymentReference=field(input.paymentReference,'reported payment reference',1000);
    }
    return item;
  });
  return {schema:CUSTOMER_RESPONSE_SCHEMA,id,account:structuredClone(account),responseDate,author,
    ...(value.previousResponseId?{previousResponseId:identifier(value.previousResponseId,'previous response')}:{}),items};
}
export function customerResponseReview({data,publication,response,workspaceId,revision,value}){
  need(plain(value),'INVALID_CUSTOMER_RESPONSE_REVIEW','Review one complete response decision.');
  need(value.expectedVersion===response.version,'STALE_CUSTOMER_RESPONSE','Reopen the received response before reviewing its next entry.',409);
  const entry=response.response.items.find(item=>item.id===value.entryId);
  need(entry,'CUSTOMER_RESPONSE_ENTRY_NOT_FOUND','Choose an entry in the retained customer response.',404);
  need(!response.decisions.some(row=>row.entryId===entry.id && row.disposition!=='DEFER'),'CUSTOMER_RESPONSE_ALREADY_REVIEWED',
    'This response entry already has a final reviewed outcome.',409);
  need(RESPONSE_DISPOSITIONS.includes(value.disposition),'INVALID_CUSTOMER_RESPONSE_DISPOSITION','Choose Record, Acknowledge, Decline or Defer.');
  const effectiveDate=dateValue(value.effectiveDate,'review effective date');
  need(effectiveDate>=response.response.responseDate && effectiveDate<=today(),'INVALID_CUSTOMER_REVIEW_DATE',
    'Choose an effective date between the customer response date and today.');
  const invoice=data.invoices.find(row=>row.id===entry.invoiceId);
  need(invoice?.document && invoice.document.customer.id===publication.customerId,'CUSTOMER_RESPONSE_INVOICE_CHANGED',
    'The original issued customer invoice is unavailable.',409);
  const original=publication.account.invoices.find(row=>row.id===entry.invoiceId);
  const current=invoiceSummary(invoice,data,effectiveDate);
  const originalSource=publication.invoiceSources.find(row=>row.invoiceId===entry.invoiceId);
  need(originalSource && originalSource.documentSha256===invoice.files['invoice.json']?.sha256,
    'CUSTOMER_RESPONSE_DOCUMENT_CHANGED','The original issued document differs from the customer account.',409);
  const caseRecord=collectionRows(data).find(row=>row.invoiceId===entry.invoiceId);
  const caseSummary=caseRecord?projectCollection(caseRecord,data,effectiveDate):null;
  const changes=['paymentStatus','total','paid','credited','amountDue','creditBalance'].filter(key=>!same(original[key],current[key]));
  const choice={entryId:entry.id,disposition:value.disposition,effectiveDate,reason:field(value.reason,'operator review reason',6000),
    acknowledgeChanges:value.acknowledgeChanges===true,expectedVersion:response.version};
  const operations=[];
  if(choice.disposition==='RECORD'){
    need(changes.length===0 || choice.acknowledgeChanges,'CUSTOMER_RESPONSE_BASIS_CHANGED',
      'Review and acknowledge the changed invoice account before recording this customer response.',409);
    need(current.paymentStatus!=='FUTURE','CUSTOMER_RESPONSE_INVOICE_FUTURE','Choose an effective date after the invoice was issued.');
    let summary=caseSummary;
    if(!caseRecord){
      need(invoice.status==='ISSUED' && minor(current.amountDue,current.currency)>0n,'CUSTOMER_RESPONSE_NO_OPEN_BALANCE',
        'This invoice has no outstanding case to open. Acknowledge the customer entry, or select an existing case.');
      const terms=collectionTerms({title:value.title??('Customer response · '+current.number),owner:value.owner,
        priority:value.priority??'NORMAL',nextActionDate:value.nextActionDate});
      need(terms.nextActionDate>=effectiveDate,'INVALID_COLLECTION_FOLLOW_UP','Choose a follow-up date on or after the review.');
      Object.assign(choice,terms);
      operations.push({kind:'OPEN',invoiceId:invoice.id,effectiveDate,...terms,note:'Customer account response '+response.id});
      summary={status:'OPEN',invoice:current,currency:currencyOf(current.currency),promise:null,dispute:null};
    }else{
      collectionDate(caseRecord,effectiveDate);
      if(caseSummary.status==='CLOSED' && ['PROMISE','DISPUTE'].includes(entry.kind)){
        need(value.reopenCase===true,'CUSTOMER_RESPONSE_REOPEN_REQUIRED','Select Reopen case to record this promise or dispute.',409);
        const nextActionDate=dateValue(value.nextActionDate,'next follow-up date');
        need(nextActionDate>=effectiveDate,'INVALID_COLLECTION_FOLLOW_UP','Choose a follow-up date on or after reopening.');
        choice.reopenCase=true;choice.nextActionDate=nextActionDate;
        operations.push({kind:'REOPEN',effectiveDate,nextActionDate,note:choice.reason});
        summary={...summary,status:'OPEN'};
      }
    }
    if(entry.kind==='PROMISE' && summary.promise?.status==='OPEN'){
      need(value.replaceOpenPromise===true,'CUSTOMER_RESPONSE_PROMISE_REVIEW_REQUIRED','Review the current open promise and explicitly withdraw it before recording its replacement.',409);
      choice.replaceOpenPromise=true;
      operations.push({kind:'ACTIVITY',value:{kind:'PROMISE_OUTCOME',promiseId:summary.promise.id,outcome:'WITHDRAWN',
        effectiveDate,occurredDate:effectiveDate,note:choice.reason,reference:response.id}});
      summary={...summary,promise:{...summary.promise,status:'WITHDRAWN'}};
    }
    if(entry.kind==='DISPUTE' && summary.dispute?.status==='OPEN'){
      need(value.resolveOpenDispute===true,'CUSTOMER_RESPONSE_DISPUTE_REVIEW_REQUIRED','Review the current dispute and explicitly resolve it before recording the new dispute.',409);
      choice.resolveOpenDispute=true;
      operations.push({kind:'ACTIVITY',value:{kind:'DISPUTE_RESOLUTION',disputeId:summary.dispute.id,
        effectiveDate,occurredDate:effectiveDate,note:choice.reason,reference:response.id}});
      summary={...summary,dispute:{...summary.dispute,status:'RESOLVED'}};
    }
    const activity={kind:['NOTE','PAYMENT_NOTICE'].includes(entry.kind)?'CONTACT':entry.kind,effectiveDate,
      occurredDate:response.response.responseDate,note:entry.note,reference:'Customer response '+response.id+' / '+entry.id};
    if(activity.kind==='CONTACT')Object.assign(activity,{channel:'OTHER',direction:'INBOUND',contact:response.response.author.name});
    if(entry.kind==='PAYMENT_NOTICE'){
      const reported='Customer reports '+current.currency.code+' '+entry.amount+' paid on '+entry.paymentDate+'; reference '+entry.paymentReference+'.';
      const available=1500-activity.reference.length-1;
      activity.reference+='\n'+(reported.length<=available?reported:reported.slice(0,available-48)+'… Complete payment details retained in response.');
    }
    if(['PROMISE','DISPUTE'].includes(entry.kind))activity.amount=entry.amount;
    if(entry.kind==='PROMISE')activity.dueDate=entry.dueDate;
    if(entry.kind==='DISPUTE')activity.category=entry.category;
    normalizeCollectionActivity(activity,summary);
    operations.push({kind:'ACTIVITY',value:activity});
  }
  const review={schema:CUSTOMER_RESPONSE_REVIEW_SCHEMA,workspaceId,revision,responseId:response.id,
    responseVersion:response.version,responseSha256:response.sourceSha256,publicationId:publication.id,
    publicationSha256:publication.sourceSha256,customer:publication.account.customer,entry:structuredClone(entry),
    originalInvoice:original,currentInvoice:current,changedFields:changes,collectionCase:caseSummary,
    choice,operations};
  return {...review,reviewSha256:sha(json(review))};
}
export function customerResponseDecisionHtml(publication,response){
  const e=escape;
  return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width">'+
    '<title>Customer response review</title><style>body{font:15px system-ui;margin:32px;max-width:1100px;color:#171717}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #ccc;padding:10px;text-align:left;vertical-align:top}pre{white-space:pre-wrap}details{margin-top:24px}</style>'+
    '<h1>Customer response review</h1><p>'+e(publication.account.customer.name)+' · Account as of '+e(publication.asOf)+'</p>'+
    '<p>Customer response: '+e(response.response.responseDate)+' · '+e(response.response.author.name)+'</p>'+
    '<table><thead><tr><th>Invoice and entry</th><th>Customer information</th><th>Reviewed outcome</th></tr></thead><tbody>'+
    response.response.items.map(item=>{const invoice=publication.account.invoices.find(row=>row.id===item.invoiceId),
      outcomes=response.decisions.filter(row=>row.entryId===item.id);
      return '<tr><td>'+e(invoice.number)+'<br>'+e(item.kind)+'</td><td><pre>'+e(item.note)+'</pre>'+
        (item.amount?e(invoice.currency.code+' '+item.amount):'')+(item.dueDate?'<p>Promised '+e(item.dueDate)+'</p>':'')+
        (item.paymentReference?'<p>Reported payment: '+e(item.paymentDate)+' · '+e(item.paymentReference)+'</p>':'')+
        '</td><td>'+outcomes.map(row=>'<p>'+e(row.disposition)+' · '+e(row.effectiveDate)+' · '+e(row.actor)+'</p><pre>'+e(row.reason)+'</pre>').join('')+'</td></tr>';}).join('')+
    '</tbody></table><details><summary>Original references</summary><pre>'+e(json({publicationId:publication.id,
      sourceSha256:publication.sourceSha256,responseId:response.id,responseSha256:response.sourceSha256,
      decisions:response.decisions}))+'</pre></details></html>\n';
}
