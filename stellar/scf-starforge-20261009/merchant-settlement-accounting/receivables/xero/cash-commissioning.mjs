// MIT. Exact original Xero cash observations reconciled with the native customer ledger.
import {TextDecoder} from 'node:util';
import {json,sha,need,plain,identifier,dateValue,currencyOf,currencyKey,minor,money,
  allocationActive,invoiceSummary,receiptSummary,refundAccountSummary} from '../core.mjs';
import {parseXeroNativeJson} from './public/native-json.mjs';

export const XERO_CASH_REVIEW_SCHEMA='stellar-forge.merchant-receivables-xero-cash-review.v1';
export const XERO_CASH_SOURCE_RULES=Object.freeze({
  specification:'https://raw.githubusercontent.com/XeroAPI/Xero-OpenAPI/fd9d44b04bf4934a7509b8e7ece51a9e0e462e4f/xero_accounting.yaml',
  version:'19.1.0',
  amounts:'Original number lexemes are retained. An omitted or null amount is not zero.',
  applications:'AppliedAmount or the exact active Allocation.Amount is used; source Total is not an invoice application.',
  classifications:'Invoice AmountCredited includes credit notes, prepayments and overpayments. Applied prepaid and overpaid cash is compared with native paid cash.',
  observations:'Provider balances describe their original observedAt. The selected asOf describes the native ledger.',
  matching:'All source, native credit, allocation, refund and original disposition capacities are shared across the complete cycle.'
});
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const HEX=/^[0-9a-f]{64}$/;
const KINDS=new Set(['ALLOCATION','CREDIT_NOTE','REFUND']);
const RECEIVABLE_PAYMENTS=new Set(['ACCRECPAYMENT','ARCREDITPAYMENT','ARPREPAYMENTPAYMENT','AROVERPAYMENTPAYMENT']);
const ACTIVE_DOCUMENTS=new Set(['AUTHORISED','PAID']);
const COLLECTIONS=['Invoices','CreditNotes','Prepayments','Overpayments','Payments'];
const MAX_CASH_ROWS=30000;
const clone=value=>structuredClone(value);
const has=(value,key)=>plain(value)&&Object.hasOwn(value,key);
const uid=value=>typeof value==='string'&&UUID.test(value)?value.toLowerCase():null;
const pointer=(base,key)=>base+'/'+String(key).replace(/~/g,'~0').replace(/\//g,'~1');
const cmp=(a,b)=>String(a).localeCompare(String(b),'en');
const sorted=values=>[...values].sort(cmp);
const keyOf=row=>row.kind+'/'+row.id;
const sameCurrency=(a,b)=>a?.code===b?.code&&a?.scale===b?.scale;
const origin=ob=>({sourceId:ob.source.id,sourceSha256:ob.source.sha256,name:ob.source.name,pointer:ob.pointer,
  observedAt:ob.source.observedAt,recordedAt:ob.source.recordedAt??null,importId:ob.source.importId??null,packageId:ob.source.packageId??null});
function canonical(value) {
  if(Array.isArray(value))return value.map(canonical);
  if(plain(value))return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
  return value;
}
const digest=value=>sha(json(canonical(value)));
function exactDecimal(raw) {
  if(typeof raw!=='string'||raw.length>180)return null;
  const m=/^(-?)(0|[1-9][0-9]*)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/.exec(raw);
  if(!m)return null;
  const exponent=Number(m[4]??0);
  if(!Number.isSafeInteger(exponent)||Math.abs(exponent)>100)return null;
  const digits=m[2]+(m[3]??''),point=m[2].length+exponent;
  let result=point<=0?'0.'+'0'.repeat(-point)+digits:
    point>=digits.length?digits+'0'.repeat(point-digits.length):digits.slice(0,point)+'.'+digits.slice(point);
  let [whole,fraction='']=result.split('.');
  whole=whole.replace(/^0+(?=\d)/,'');fraction=fraction.replace(/0+$/,'');
  result=whole+(fraction?'.'+fraction:'');
  return m[1]&&result!=='0'?'-'+result:result;
}
function moneyField(row,key,currency,ob,{signed=false}={}) {
  const p=pointer(ob.pointer,key),raw=has(row,key)?row[key]:null;
  const result={present:has(row,key),valid:false,raw,amount:null,pointer:p,
    sourceType:ob.tokens?.has(p)?'number':raw===null?'null':typeof raw};
  if(!result.present){result.reason='MISSING';return result;}
  const decimal=exactDecimal(raw);
  if(decimal===null){result.reason=raw===null?'NULL':'INVALID_DECIMAL';return result;}
  try{result.amount=money(minor(decimal,currency,key,{signed}),currency);result.valid=true;}
  catch{result.reason='CURRENCY_PRECISION_OR_RANGE';}
  return result;
}
function decimalField(row,key,ob) {
  const p=pointer(ob.pointer,key),raw=has(row,key)?row[key]:null;
  const value=exactDecimal(raw);
  return {present:has(row,key),valid:has(row,key)&&value!==null,raw,value,
    sourceType:ob.tokens?.has(p)?'number':raw===null?'null':typeof raw,pointer:p};
}
function sourceDate(value) {
  if(typeof value!=='string')return null;
  const ms=/^\/Date\((-?[0-9]+)(?:[+-][0-9]{4})?\)\/$/.exec(value);
  if(ms) {
    const n=Number(ms[1]);
    if(!Number.isSafeInteger(n)||Math.abs(n)>8640000000000000)return null;
    const d=new Date(n);return Number.isFinite(d.valueOf())?d.toISOString().slice(0,10):null;
  }
  const match=/^([0-9]{4}-[0-9]{2}-[0-9]{2})(?:T[0-9:.]+(?:Z|[+-][0-9:]+)?)?$/.exec(value);
  if(!match)return null;
  try{return dateValue(match[1],'original provider date');}catch{return null;}
}
function dateField(row,ob) {
  const items=['Date','DateString'].filter(key=>has(row,key)).map(key=>({key,raw:row[key],date:sourceDate(row[key]),pointer:pointer(ob.pointer,key)}));
  const dates=new Set(items.map(item=>item.date).filter(Boolean));
  return {present:items.length>0,valid:items.length>0&&items.every(item=>item.date)&&dates.size===1,
    date:dates.size===1?[...dates][0]:null,values:items};
}
function fieldObservation(rows,getter) {
  if(!rows.length)return {present:false,conflict:false,values:[],sources:[]};
  const observedAt=rows.map(row=>row.source.observedAt).sort().at(-1),latest=rows.filter(row=>row.source.observedAt===observedAt);
  const values=latest.map(row=>({ob:row,value:getter(row)})).filter(row=>row.value!==undefined);
  const unique=new Map(values.map(row=>[json(canonical(row.value)),row.value]));
  return {present:values.length>0,conflict:unique.size>1,value:unique.size===1?[...unique.values()][0]:null,
    values:[...unique.values()],sources:latest.map(origin),observedAt,rows:latest};
}
function latestKnown(rows,getter) {
  return fieldObservation(rows.filter(row=>getter(row)!==undefined),getter);
}
function issueCollector() {
  const result=[],seen=new Set();
  const add=(code,message,details={},severity='ACTION')=>{
    const row={code,severity,message,...details},key=digest(row);
    if(!seen.has(key)){seen.add(key);result.push({id:key,...row});}
    return row;
  };
  return {result,add};
}
function file(name,value,role,type='application/json; charset=utf-8') {
  return {name,bytes:Buffer.from(typeof value==='string'?value:json(value)),role,type};
}
function plainSelection(selection,currency) {
  need(plain(selection)&&Array.isArray(selection.matches??[])&&Array.isArray(selection.sourceBindings??[]),
    'XERO_CASH_SELECTION','Use the complete reviewed cash selection.');
  const bindings=(selection.sourceBindings??[]).map(row=>{
    need(plain(row)&&['PREPAYMENT','OVERPAYMENT'].includes(row.kind),'XERO_CASH_BINDING','Choose an original prepayment or overpayment.');
    return {kind:row.kind,externalId:identifier(row.externalId,'source cash identity'),customerId:identifier(row.customerId,'source customer')};
  });
  const matches=(selection.matches??[]).map(row=>{
    need(plain(row)&&typeof row.entryKey==='string'&&row.entryKey.length>0&&row.entryKey.length<=300&&
      Array.isArray(row.native)&&row.native.length>0&&row.native.length<=1000,
      'XERO_CASH_MATCH','Choose a source entry and its complete original ledger portions.');
    const native=row.native.map(part=>{
      need(plain(part)&&KINDS.has(part.kind),'XERO_CASH_NATIVE_KIND','Choose an original allocation, credit note or refund.');
      return {kind:part.kind,id:identifier(part.id,'native cash record'),
        amount:money(minor(part.amount,currency,'matched cash portion',{positive:true}),currency)};
    });
    need(new Set(native.map(keyOf)).size===native.length,'XERO_CASH_DUPLICATE_PORTION','Select each original ledger row once within a source match.');
    const reason=row.dateDifferenceReason??'';
    need(typeof reason==='string'&&reason.length<=3000,'XERO_CASH_DATE_REASON','Keep a concise original explanation for different cash dates.');
    return {entryKey:row.entryKey,native:native.sort((a,b)=>cmp(keyOf(a),keyOf(b))),dateDifferenceReason:reason.trim()};
  });
  need(bindings.length<=5000&&matches.length<=10000,'XERO_CASH_DECISION_LIMIT','Choose the supported original cash decisions.');
  need(new Set(matches.map(row=>row.entryKey)).size===matches.length,'XERO_CASH_DUPLICATE_MATCH','Review each source cash entry once.');
  need(new Set(bindings.map(row=>row.kind+'/'+row.externalId)).size===bindings.length,'XERO_CASH_DUPLICATE_BINDING','Bind each original cash source once.');
  return {...clone(selection),matches:matches.sort((a,b)=>cmp(a.entryKey,b.entryKey)),
    sourceBindings:bindings.sort((a,b)=>cmp(a.kind+'/'+a.externalId,b.kind+'/'+b.externalId))};
}
function sourceIndex(input,currency,findings) {
  const invoices=new Map(),headers=new Map(),payments=new Map(),applications=new Map(),parentCollections=new Map();
  const summaries=[],allSources=[],numeric=[];
  let rowCount=0;
  const add=(map,key,row)=>{if(!map.has(key))map.set(key,[]);map.get(key).push(row);};
  const application=(kind,id,invoiceId,ob,value)=>{
    if(!id||!invoiceId)return;
    add(applications,kind+'/'+id+'/'+invoiceId,{...ob,kind,externalId:id,externalInvoiceId:invoiceId,...value});
  };
  const payment=(row,ob,parent={})=>{
    if(!plain(row)){findings.add('PAYMENT_RECORD','An original Payments item is not an object.',origin(ob));return;}
    const id=uid(row.PaymentID);
    if(!id){findings.add('PAYMENT_ID_MISSING','Retain the original PaymentID before matching this cash entry.',origin(ob));return;}
    add(payments,id,{...ob,row,parent});
  };
  const parent=(kind,row,ob,invoiceContext=null)=>{
    if(!plain(row)){findings.add('CASH_SOURCE_RECORD','An original cash source is not an object.',origin(ob));return;}
    const id=uid(row[{CREDIT_NOTE:'CreditNoteID',PREPAYMENT:'PrepaymentID',OVERPAYMENT:'OverpaymentID'}[kind]]);
    if(!id){findings.add('CASH_SOURCE_ID_MISSING','The original '+kind+' identity is missing.',origin(ob));return;}
    add(headers,kind+'/'+id,{...ob,row,kind,externalId:id,invoiceContext});
    if(invoiceContext&&has(row,'AppliedAmount'))application(kind,id,invoiceContext,ob,{mode:'APPLIED_AMOUNT',row});
    if(has(row,'Allocations')) {
      if(!Array.isArray(row.Allocations))findings.add('ALLOCATION_COLLECTION','The original Allocations field is not an array.',origin(ob));
      else {
        const collection={...ob,kind,externalId:id,rows:row.Allocations};
        add(parentCollections,kind+'/'+id,collection);
        row.Allocations.forEach((allocation,index)=>{
          const target=uid(allocation?.Invoice?.InvoiceID);
          if(!target)findings.add('ALLOCATION_INVOICE_ID','The original allocation needs its exact InvoiceID.',
            {...origin(ob),pointer:pointer(pointer(ob.pointer,'Allocations'),index)});
          else if(!applications.has(kind+'/'+id+'/'+target))applications.set(kind+'/'+id+'/'+target,[]);
        });
      }
    }
    if(has(row,'Payments')) {
      if(!Array.isArray(row.Payments))findings.add('PAYMENT_COLLECTION','The original Payments field is not an array.',origin(ob));
      else row.Payments.forEach((item,index)=>payment(item,{...ob,pointer:pointer(pointer(ob.pointer,'Payments'),index)},{kind,externalId:id}));
    }
  };
  const invoice=(row,ob,{nested=false}={})=>{
    if(!plain(row)){findings.add('INVOICE_RECORD','An original invoice item is not an object.',origin(ob));return;}
    const id=uid(row.InvoiceID);
    if(!id){if(!nested)findings.add('INVOICE_ID_MISSING','The original invoice needs its exact InvoiceID.',origin(ob));return;}
    if(row.Type!==undefined&&row.Type!=='ACCREC')return;
    const describesCash=!nested||['Total','AmountPaid','AmountDue','AmountCredited','Payments','CreditNotes','Prepayments','Overpayments'].some(key=>has(row,key));
    if(describesCash)add(invoices,id,{...ob,row,externalId:id});
    for(const [collection,kind]of [['CreditNotes','CREDIT_NOTE'],['Prepayments','PREPAYMENT'],['Overpayments','OVERPAYMENT']])if(has(row,collection)) {
      if(!Array.isArray(row[collection]))findings.add('INVOICE_CASH_COLLECTION','The original invoice '+collection+' field is not an array.',origin(ob));
      else row[collection].forEach((item,index)=>parent(kind,item,{...ob,pointer:pointer(pointer(ob.pointer,collection),index)},id));
    }
    if(has(row,'Payments')) {
      if(!Array.isArray(row.Payments))findings.add('PAYMENT_COLLECTION','The original invoice Payments field is not an array.',origin(ob));
      else row.Payments.forEach((item,index)=>payment(item,{...ob,pointer:pointer(pointer(ob.pointer,'Payments'),index)},{kind:'INVOICE',externalId:id}));
    }
  };
  for(const source of input) {
    need(plain(source)&&typeof source.id==='string'&&Buffer.isBuffer(source.bytes)&&HEX.test(source.sha256)&&sha(source.bytes)===source.sha256,
      'XERO_CASH_SOURCE_HASH','Use the unchanged original source bytes.',409);
    need(typeof source.observedAt==='string'&&Number.isFinite(Date.parse(source.observedAt)),
      'XERO_CASH_SOURCE_TIME','Keep the original source observation time.');
    const descriptor={id:source.id,name:source.name,sha256:source.sha256,bytes:source.bytes.length,observedAt:source.observedAt,
      recordedAt:source.recordedAt??null,importId:source.importId??null,packageId:source.packageId??null};
    allSources.push(descriptor);
    let parsed;
    try{parsed=parseXeroNativeJson(new TextDecoder('utf-8',{fatal:true}).decode(source.bytes));}
    catch(error){summaries.push({...descriptor,status:'SOURCE_ERROR',code:error.code??'XERO_CASH_UTF8',message:error.message});
      findings.add(error.code??'XERO_CASH_UTF8',error.message,{sourceId:source.id,sourceSha256:source.sha256});continue;}
    const envelope=parsed.value,tokens=new Map(parsed.numericTokens.map(item=>[item.pointer,item]));
    if(!plain(envelope)){summaries.push({...descriptor,status:'SOURCE_ERROR'});findings.add('XERO_CASH_ENVELOPE','Retain the complete original Xero response object.',{sourceId:source.id});continue;}
    const names=COLLECTIONS.filter(key=>has(envelope,key));
    const envelopeStatus=has(envelope,'Status')?envelope.Status:null;
    const summary={...descriptor,status:'READ',responseId:envelope.Id??null,responseStatus:envelopeStatus,
      providerName:envelope.ProviderName??null,responseDate:envelope.DateTimeUTC??null,
      numericTokenCount:parsed.numericTokens.length,collections:[]};
    summaries.push(summary);
    if(!names.length){summary.status='NO_CASH_COLLECTION';findings.add('XERO_CASH_COLLECTION_MISSING',
      'This original response has no invoice, credit, prepayment, overpayment or payment collection.',{sourceId:source.id});continue;}
    if(envelopeStatus!==null&&envelopeStatus!=='OK') {
      summary.status='PROVIDER_REJECTED';findings.add('XERO_CASH_PROVIDER_REJECTED',
        'The original Xero response reports '+String(envelopeStatus)+'. Retain its corrected source response.',{sourceId:source.id});continue;
    }
    for(const name of names) {
      if(!Array.isArray(envelope[name])){findings.add('XERO_CASH_COLLECTION','The original '+name+' collection is not an array.',{sourceId:source.id});continue;}
      summary.collections.push({name,count:envelope[name].length});
      rowCount+=envelope[name].length;
      need(rowCount<=MAX_CASH_ROWS,'XERO_CASH_SOURCE_ROWS','Select at most '+MAX_CASH_ROWS+' top-level original cash records.');
      envelope[name].forEach((row,index)=>{
        const ob={source,tokens,pointer:pointer('/'+name,index)};
        if(row?.HasValidationErrors===true||row?.HasErrors===true||Array.isArray(row?.ValidationErrors)&&row.ValidationErrors.length) {
          findings.add('XERO_CASH_RECORD_REJECTED','This original provider record carries validation errors.',origin(ob));return;
        }
        if(name==='Invoices')invoice(row,ob);
        else if(name==='CreditNotes')parent('CREDIT_NOTE',row,ob);
        else if(name==='Prepayments')parent('PREPAYMENT',row,ob);
        else if(name==='Overpayments')parent('OVERPAYMENT',row,ob);
        else {
          payment(row,ob);
          if(plain(row?.Invoice))invoice(row.Invoice,{...ob,pointer:pointer(ob.pointer,'Invoice')},{nested:true});
          for(const [property,kind]of [['CreditNote','CREDIT_NOTE'],['Prepayment','PREPAYMENT'],['Overpayment','OVERPAYMENT']])
            if(plain(row?.[property]))parent(kind,row[property],{...ob,pointer:pointer(ob.pointer,property)});
        }
      });
    }
    numeric.push({sourceId:source.id,sourceSha256:source.sha256,numericTokens:parsed.numericTokens});
  }
  for(const [key,observations]of applications) {
    const [kind,id,invoiceId]=key.split('/');
    const collectionName={CREDIT_NOTE:'CreditNotes',PREPAYMENT:'Prepayments',OVERPAYMENT:'Overpayments'}[kind];
    for(const invoice of invoices.get(invoiceId)??[])if(Array.isArray(invoice.row[collectionName])) {
      const property={CREDIT_NOTE:'CreditNoteID',PREPAYMENT:'PrepaymentID',OVERPAYMENT:'OverpaymentID'}[kind];
      const listed=invoice.row[collectionName].filter(row=>uid(row?.[property])===id);
      if(listed.length===0)observations.push({...invoice,kind,externalId:id,externalInvoiceId:invoiceId,mode:'EXPLICIT_ABSENCE'});
      else if(listed.every(row=>!has(row,'AppliedAmount')&&!Array.isArray(row.Allocations)))
        observations.push({...invoice,kind,externalId:id,externalInvoiceId:invoiceId,mode:'MISSING_AMOUNT'});
    }
    for(const collection of parentCollections.get(kind+'/'+id)??[])observations.push({...collection,externalInvoiceId:invoiceId,mode:'ALLOCATIONS',
      rows:collection.rows.map((row,index)=>({row,pointer:pointer(pointer(collection.pointer,'Allocations'),index)}))
        .filter(item=>uid(item.row?.Invoice?.InvoiceID)===invoiceId)});
  }
  return {invoices,headers,payments,applications,parentCollections,sources:allSources.sort((a,b)=>cmp(a.id,b.id)),summaries,numeric};
}


function originalBindings(packages,resolutions,snapshot,currency,findings) {
  const documents=new Map(),external=new Map(),customers=new Map(snapshot.customers.map(row=>[row.id,row]));
  for(const pack of packages)for(const document of pack.documents??[]) {
    if(!sameCurrency(document.currency,currency))continue;
    const previous=documents.get(document.id);
    if(previous&&previous.sourceSha256!==document.sourceSha256) {
      findings.add('ORIGINAL_DOCUMENT_VERSION_CONFLICT','The selected packages contain different original bytes for one issued document.',
        {documentId:document.id,documentNumber:document.number});continue;
    }
    if(!previous)documents.set(document.id,{...clone(document),packageIds:[]});
    const row=documents.get(document.id);if(!row.packageIds.includes(pack.id))row.packageIds.push(pack.id);
  }
  for(const document of documents.values()) {
    const matches=resolutions.filter(row=>row.documentId===document.id&&row.sourceSha256===document.sourceSha256);
    const accepted=matches.filter(row=>row.imported===true&&row.status==='IMPORTED'&&uid(row.externalDocumentId));
    const ids=new Set(accepted.map(row=>uid(row.externalDocumentId)));
    document.resolutions=clone(matches);document.externalDocumentId=ids.size===1?[...ids][0]:null;
    document.bindingStatus=ids.size===1?'IMPORTED':ids.size>1?'CONFLICT':'UNRESOLVED';
    if(!document.externalDocumentId) {
      findings.add('ORIGINAL_XERO_BINDING_REQUIRED','Receive the original matching Xero document before reconciling its cash.',
        {documentId:document.id,documentNumber:document.number,status:document.bindingStatus});continue;
    }
    const key=document.kind+'/'+document.externalDocumentId,previous=external.get(key);
    if(previous&&previous.id!==document.id) {
      previous.bindingStatus='CONFLICT';document.bindingStatus='CONFLICT';external.delete(key);
      findings.add('XERO_DOCUMENT_ID_COLLISION','One provider document ID belongs to two selected original documents.',
        {externalId:document.externalDocumentId,documentIds:[previous.id,document.id]});
    } else external.set(key,document);
  }
  return {documents,external,customers};
}
function providerEntries(index,bindings,selection,currency,findings) {
  const entries=[],bindingRequests=[],cashSources=[],customerIds=new Set(bindings.customers.keys());
  const explicit=new Map(selection.sourceBindings.map(row=>[row.kind+'/'+row.externalId,row]));
  const usedBindings=new Set(),headerViews=new Map(),inferredByParent=new Map();
  for(const key of index.applications.keys()) {
    const [kind,id,invoiceId]=key.split('/'),doc=bindings.external.get('INVOICE/'+invoiceId);
    if(doc){const parentKey=kind+'/'+id;if(!inferredByParent.has(parentKey))inferredByParent.set(parentKey,new Set());inferredByParent.get(parentKey).add(doc.customerId);}
  }
  const header=(kind,id)=>{
    const key=kind+'/'+id;if(headerViews.has(key))return headerViews.get(key);
    const observations=index.headers.get(key)??[];
    const field=name=>latestKnown(observations,ob=>has(ob.row,name)?ob.row[name]:undefined);
    const status=field('Status'),type=field('Type'),currencyCode=field('CurrencyCode'),contact=field('Contact');
    const inferred=new Set(inferredByParent.get(key)??[]);
    const doc=kind==='CREDIT_NOTE'?bindings.external.get('CREDIT_NOTE/'+id):null;
    if(doc)inferred.add(doc.customerId);
    const requested=explicit.get(key);
    if(requested)usedBindings.add(key);
    const chosen=requested?.customerId??(inferred.size===1?[...inferred][0]:null);
    const bindingConflict=inferred.size>1||requested&&(!customerIds.has(chosen)||inferred.size===1&&!inferred.has(chosen));
    if(bindingConflict)findings.add('CASH_CUSTOMER_BINDING_CONFLICT','The selected customer contradicts the original invoice or credit relationships.',
      {kind,externalId:id,customerId:chosen,inferredCustomerIds:sorted(inferred)});
    if(!chosen&&!doc&&['PREPAYMENT','OVERPAYMENT'].includes(kind))bindingRequests.push({kind,externalId:id,
      contactId:contact.value?.ContactID??null,contactName:contact.value?.Name??null,sources:observations.map(origin)});
    const value={kind,externalId:id,documentId:doc?.id??null,document:doc??null,
      customerId:bindingConflict?null:chosen,bindingConflict,status:status.value??null,statusConflict:status.conflict,
      statusObservedAt:status.observedAt??null,type:type.value??null,typeConflict:type.conflict,
      currencyCode:currencyCode.value??null,currencyConflict:currencyCode.conflict,
      contact:contact.value??null,observations};
    headerViews.set(key,value);return value;
  };
  function entryBase(kind,id,externalInvoiceId,sources) {
    const document=externalInvoiceId?bindings.external.get('INVOICE/'+externalInvoiceId):null;
    return {key:null,kind,externalId:id,externalInvoiceId:externalInvoiceId??null,documentId:document?.id??null,
      documentNumber:document?.number??null,customerId:document?.customerId??null,customerName:document?.customerName??null,
      currency:clone(currency),amount:null,date:null,status:'UNMATCHED',message:'Choose the exact original ledger portions.',
      native:[],matchedAmount:money(0n,currency),remainingAmount:null,candidateKeys:[],sources,
      _usable:true,_units:0n,_problems:[]};
  }
  const problem=(entry,code,message,details={})=>{
    entry._usable=false;entry._problems.push(code);
    findings.add(code,message,{entryKey:entry.key,...details});return entry;
  };
  for(const [id,observations]of index.payments) {
    const latest=fieldObservation(observations,ob=>{
      const row=ob.row,context=ob.parent??{};
      let invoiceId=uid(row.Invoice?.InvoiceID),creditId=uid(row.CreditNote?.CreditNoteID),
        prepaymentId=uid(row.Prepayment?.PrepaymentID),overpaymentId=uid(row.Overpayment?.OverpaymentID);
      if(row.Invoice?.Type==='ACCRECCREDIT'){creditId=invoiceId;invoiceId=null;}
      if(context.kind==='INVOICE')invoiceId=invoiceId??context.externalId;
      if(context.kind==='CREDIT_NOTE')creditId=creditId??context.externalId;
      if(context.kind==='PREPAYMENT')prepaymentId=prepaymentId??context.externalId;
      if(context.kind==='OVERPAYMENT')overpaymentId=overpaymentId??context.externalId;
      return {invoiceId,creditId,prepaymentId,overpaymentId};
    });
    const field=name=>fieldObservation(observations,ob=>has(ob.row,name)?ob.row[name]:undefined);
    const amountResult=fieldObservation(observations,ob=>{
      const value=moneyField(ob.row,'Amount',currency,ob);return value.present?{valid:value.valid,amount:value.amount,reason:value.reason??null}:undefined;
    });
    const dateResult=fieldObservation(observations,ob=>{const d=dateField(ob.row,ob);return d.present?{valid:d.valid,date:d.date}:undefined;});
    const identity=latest.value??{},paymentType=field('PaymentType'),status=field('Status'),bank=field('BankAmount'),
      rate=field('CurrencyRate'),reconciled=field('IsReconciled'),reference=field('Reference');
    const references=[identity.invoiceId,identity.creditId,identity.prepaymentId,identity.overpaymentId].filter(Boolean);
    const isRefund=Boolean(identity.creditId||identity.prepaymentId||identity.overpaymentId);
    const entry=entryBase(isRefund?'REFUND':'PAYMENT',id,identity.invoiceId,latest.sources);
    entry.key='PAYMENT/'+id;entry.paymentId=id;entry.paymentType=paymentType.value??null;
    entry.providerStatus=status.value??null;entry.isReconciled=reconciled.present?reconciled.value:null;
    entry.bankAmount=bank.present?bank.value:null;entry.bankCurrencyCode=null;entry.currencyRate=rate.present?rate.value:null;
    entry.reference=reference.value??null;entry.date=dateResult.value?.date??null;
    entry.amount=amountResult.value?.valid?amountResult.value.amount:null;
    entry.dateEvidence={...(dateResult.value??{valid:false,date:null}),observations:(dateResult.rows??[]).map(ob=>({...origin(ob),field:dateField(ob.row,ob)}))};
    entry.amountEvidence={...(amountResult.present?{present:true,...amountResult.value}:{present:false,valid:false,amount:null}),observations:(amountResult.rows??[]).map(ob=>({...origin(ob),field:moneyField(ob.row,'Amount',currency,ob)}))};
    entry.bankAmountEvidence={present:bank.present,raw:bank.value??null,observations:(bank.rows??[]).filter(ob=>has(ob.row,'BankAmount')).map(ob=>({...origin(ob),field:decimalField(ob.row,'BankAmount',ob)}))};
    entry.reconciledEvidence={present:reconciled.present,value:reconciled.value??null};
    entry.observedAt=latest.observedAt;
    const account=field('Account');entry.bankAccount=account.value??null;
    entry.bankCurrencyCode=account.value?.CurrencyCode??null;
    let parent=null;
    if(isRefund) {
      const kind=identity.creditId?'CREDIT_NOTE':identity.prepaymentId?'PREPAYMENT':'OVERPAYMENT';
      const parentId=identity.creditId??identity.prepaymentId??identity.overpaymentId;parent=header(kind,parentId);
      entry.sourceKind=kind;entry.sourceExternalId=parentId;entry.creditId=parent.documentId;
      entry.customerId=parent.customerId;entry.customerName=bindings.customers.get(parent.customerId)?.name??null;
      entry.creditDocumentNumber=parent.document?.number??null;
    }
    const invoice=identity.invoiceId?bindings.external.get('INVOICE/'+identity.invoiceId):null;
    const expectedType=isRefund?{CREDIT_NOTE:'ARCREDITPAYMENT',PREPAYMENT:'ARPREPAYMENTPAYMENT',OVERPAYMENT:'AROVERPAYMENTPAYMENT'}[parent.kind]:'ACCRECPAYMENT';
    const sourceCurrency=fieldObservation(observations,ob=>{
      const row=ob.row;
      return row.Invoice?.CurrencyCode??row.CreditNote?.CurrencyCode??row.Prepayment?.CurrencyCode??row.Overpayment?.CurrencyCode??row.CurrencyCode;
    });
    if(latest.conflict||references.length!==1)problem(entry,'PAYMENT_DOCUMENT_CONFLICT','One payment must retain one unambiguous original document relationship.');
    if(paymentType.conflict||status.conflict||amountResult.conflict||dateResult.conflict||sourceCurrency.conflict)
      problem(entry,'PAYMENT_SOURCE_CONFLICT','Original responses observed at the same time disagree about this payment.');
    if(!RECEIVABLE_PAYMENTS.has(paymentType.value)||paymentType.value!==expectedType)
      problem(entry,'PAYMENT_TYPE_REQUIRED','Retain the exact accounts-receivable PaymentType for this original document.');
    if(sourceCurrency.value&&sourceCurrency.value!==currency.code||parent?.currencyCode&&parent.currencyCode!==currency.code)
      problem(entry,'PAYMENT_CURRENCY_MISMATCH','The original payment currency differs from this package currency.');
    if(!entry.amount)problem(entry,'PAYMENT_AMOUNT_MISSING','Retain the exact original payment Amount in invoice currency.');
    else entry._units=minor(entry.amount,currency);
    if(!dateResult.value?.valid)problem(entry,'PAYMENT_DATE_MISSING','Retain the original payment date before matching this cash entry.');
    if(status.value==='DELETED'){entry._usable=false;entry.status='DELETED';entry.message='The original provider payment is deleted.';}
    else if(status.value!=='AUTHORISED')problem(entry,'PAYMENT_STATUS_MISSING','Retain the original payment Status; bank reconciliation is a separate field.');
    if(!entry.customerId||!isRefund&&!invoice)problem(entry,'PAYMENT_ORIGINAL_BINDING_REQUIRED','Resolve the original customer document or source-customer binding.');
    if(entry.date&&entry.date>selection.asOf){entry._usable=false;entry.status='AFTER_ACCOUNT_DATE';entry.message='This provider payment is later than the selected native account date.';}
    if(entry.amount!==null&&entry._units===0n){entry._usable=false;entry.status='NO_CASH';entry.message='The original payment amount is explicitly zero.';}
    if(entry._problems.length){entry.status='REVIEW_REQUIRED';entry.message='Resolve the original source fields or binding listed in this review.';}
    entry.remainingAmount=entry.amount;entries.push(entry);
  }
  for(const [group,observations]of index.applications) {
    const [sourceKind,id,externalInvoiceId]=group.split('/'),parent=header(sourceKind,id);
    const kind={CREDIT_NOTE:'CREDIT_APPLICATION',PREPAYMENT:'PREPAYMENT_APPLICATION',OVERPAYMENT:'OVERPAYMENT_APPLICATION'}[sourceKind];
    const latest=fieldObservation(observations,ob=>{
      if(ob.mode==='EXPLICIT_ABSENCE')return {mode:ob.mode,valid:true,amount:money(0n,currency),date:null,allocationIds:[],deletedIds:[],fields:[],errors:[]};
      if(ob.mode==='MISSING_AMOUNT')return {mode:ob.mode,valid:false,amount:null,date:null,allocationIds:[],deletedIds:[],fields:[],errors:['APPLICATION_AMOUNT_MISSING']};
      if(ob.mode==='APPLIED_AMOUNT') {
        const amount=moneyField(ob.row,'AppliedAmount',currency,ob);
        return {mode:ob.mode,valid:amount.valid,amount:amount.amount,date:null,allocationIds:[],deletedIds:[],
          fields:[{pointer:amount.pointer,raw:amount.raw,sourceType:amount.sourceType}],errors:amount.valid?[]:['APPLICATION_AMOUNT']};
      }
      let units=0n;const ids=[],deleted=[],dates=[],fields=[],errors=[],seen=new Set();
      for(const item of ob.rows) {
        const row=item.row,child={...ob,pointer:item.pointer},allocationId=uid(row?.AllocationID);
        if(!plain(row)||!allocationId){errors.push('ALLOCATION_ID_MISSING');continue;}
        if(seen.has(allocationId)){errors.push('ALLOCATION_ID_DUPLICATED');continue;}seen.add(allocationId);
        const amount=moneyField(row,'Amount',currency,child),date=dateField(row,child);
        fields.push({allocationId,pointer:item.pointer,amount:{present:amount.present,raw:amount.raw,sourceType:amount.sourceType},
          date:date.values,isDeleted:{present:has(row,'IsDeleted'),value:row.IsDeleted??null}});
        if(row.IsDeleted===true){deleted.push(allocationId);continue;}
        if(row.IsDeleted!==false){errors.push('ALLOCATION_STATE_MISSING');continue;}
        if(!amount.valid){errors.push('ALLOCATION_AMOUNT_MISSING');continue;}
        if(!date.valid){errors.push('ALLOCATION_DATE_MISSING');continue;}
        units+=minor(amount.amount,currency);ids.push(allocationId);dates.push(date.date);
      }
      const uniqueDates=new Set(dates);
      return {mode:ob.mode,valid:errors.length===0,amount:errors.length?null:money(units,currency),
        date:uniqueDates.size===1?[...uniqueDates][0]:null,dates:sorted(uniqueDates),
        allocationIds:ids.sort(),deletedIds:deleted.sort(),fields,errors:sorted(new Set(errors))};
    });
    // AppliedAmount and a complete allocation list may express the same amount at the same observation time.
    let selected=latest.value,conflict=latest.conflict;
    if(conflict) {
      const values=latest.values,amounts=new Set(values.filter(row=>row.valid).map(row=>row.amount));
      const allocationSets=new Set(values.filter(row=>row.mode==='ALLOCATIONS').map(row=>json({ids:row.allocationIds,deleted:row.deletedIds,dates:row.dates})));
      if(values.every(row=>row.valid)&&amounts.size===1&&allocationSets.size<=1) {
        selected=values.find(row=>row.mode==='ALLOCATIONS')??values[0];conflict=false;
      }
    }
    const entry=entryBase(kind,id,externalInvoiceId,latest.sources);
    entry.key=kind+'/'+id+'/'+externalInvoiceId;entry.sourceKind=sourceKind;entry.sourceExternalId=id;
    entry.creditId=parent.documentId;entry.providerStatus=parent.status;
    entry.amount=selected?.valid?selected.amount:null;entry.date=selected?.date??null;
    entry.applicationEvidence=selected??{valid:false,amount:null,errors:['SOURCE_CONFLICT']};
    entry.allocationIds=selected?.allocationIds??[];entry.deletedAllocationIds=selected?.deletedIds??[];
    entry.observedAt=latest.observedAt;entry.customerId=entry.customerId??parent.customerId;
    entry.customerName=bindings.customers.get(entry.customerId)?.name??entry.customerName;
    entry.reference=parent.document?.number??null;
    if(parent.customerId&&entry.customerId!==parent.customerId)problem(entry,'APPLICATION_CUSTOMER_CONFLICT','The cash source and target invoice belong to different original customers.');
    if(conflict||parent.statusConflict||parent.currencyConflict)problem(entry,'APPLICATION_SOURCE_CONFLICT','The original source observations disagree about this invoice application.');
    if(!entry.amount)problem(entry,'APPLICATION_AMOUNT_MISSING','Retain AppliedAmount or the exact active Allocation.Amount, Date and IsDeleted fields.');
    else entry._units=minor(entry.amount,currency);
    if(!ACTIVE_DOCUMENTS.has(parent.status))problem(entry,'APPLICATION_SOURCE_STATUS','Retain the original authorised or paid credit/prepayment/overpayment status.');
    if(parent.currencyCode&&parent.currencyCode!==currency.code)problem(entry,'APPLICATION_CURRENCY_MISMATCH','This application belongs to a different original source currency.');
    if(parent.typeConflict||sourceKind==='CREDIT_NOTE'&&parent.type&&parent.type!=='ACCRECCREDIT'||
      sourceKind==='PREPAYMENT'&&parent.type&&!['RECEIVE-PREPAYMENT','ARPREPAYMENT'].includes(parent.type)||
      sourceKind==='OVERPAYMENT'&&parent.type&&!['RECEIVE-OVERPAYMENT','AROVERPAYMENT'].includes(parent.type))
      problem(entry,'APPLICATION_SOURCE_TYPE','Choose an original accounts-receivable cash source.');
    if(!entry.documentId||!entry.customerId||sourceKind==='CREDIT_NOTE'&&!entry.creditId)
      problem(entry,'APPLICATION_ORIGINAL_BINDING_REQUIRED','Receive the original credit and invoice identities or bind the original prepaid/overpaid source customer.');
    if(entry.date&&entry.date>selection.asOf){entry._usable=false;entry.status='AFTER_ACCOUNT_DATE';entry.message='The original application occurs after this native account date.';}
    if(entry.amount!==null&&entry._units===0n){entry._usable=false;entry.status='NO_CASH';entry.message='The original source explicitly has no active application to this invoice.';}
    if(parent.status==='VOIDED'){entry._usable=false;entry.status='VOIDED';entry.message='The original source is voided.';}
    if(entry._problems.length){entry.status='REVIEW_REQUIRED';entry.message='Resolve the exact source application or document binding.';}
    entry.remainingAmount=entry.amount;entries.push(entry);
  }
  for(const [key,observations]of index.headers) {
    const [kind,id]=key.split('/'),value=header(kind,id);
    const field=name=>invoiceField(observations.filter(ob=>has(ob.row,name)),name,currency);
    const total=field('Total'),remaining=field('RemainingCredit');
    cashSources.push({kind,externalId:id,documentId:value.documentId,customerId:value.customerId,contact:value.contact,
      status:value.status,currency:clone(currency),sourceCurrencyCode:value.currencyCode,total:total.amount,
      remainingCredit:remaining.amount,totalEvidence:total,remainingCreditEvidence:remaining,
      sources:observations.map(origin)});
  }
  for(const [key,row]of explicit)if(!usedBindings.has(key))findings.add('SOURCE_BINDING_NOT_OBSERVED',
    'This retained customer binding has no corresponding source in the current selection.',{binding:row});
  need(entries.length<=MAX_CASH_ROWS,'XERO_CASH_ENTRY_LIMIT','Select at most '+MAX_CASH_ROWS+' distinct original cash entries.');
  return {entries:entries.sort((a,b)=>cmp(a.key,b.key)),bindingRequests,cashSources,headerViews};
}


function nativeCashRows(snapshot,currency,asOf,findings) {
  const invoices=new Map(snapshot.invoices.map(row=>[row.id,row])),receipts=new Map(snapshot.receipts.map(row=>[row.id,row])),
    allocations=new Map(snapshot.allocations.map(row=>[row.id,row])),credits=new Map(snapshot.credits.map(row=>[row.id,row]));
  const rows=[],byKey=new Map(),lineage={},groups=new Map(),targets=new Map(),refundGroups=new Map();
  const add=row=>{rows.push(row);byKey.set(keyOf(row),row);};
  const receiptBrief=receipt=>({id:receipt.id,reference:receipt.reference,amount:receipt.amount,receivedDate:receipt.receivedDate,
    accountingDate:receipt.accountingDate??receipt.receivedDate,replacesReceiptId:receipt.replacesReceiptId??null,
    replacementReceiptIds:clone(receipt.replacementReceiptIds??[]),replacementRole:receipt.replacementRole??null,
    sourceKey:receipt.sourceKey??null,bankSourceCount:receipt.bankSources?.length??0});
  for(const receipt of snapshot.receipts)if(sameCurrency(receipt.currency,currency)) {
    lineage[receipt.id]={...receiptBrief(receipt),customerId:receipt.customerId,currency:clone(currency),
      status:receipt.status,voidDate:receipt.voidDate??null,source:clone(receipt.source??null),bankSources:clone(receipt.bankSources??[])};
    const summary=receiptSummary(receipt,snapshot,asOf);
    if(minor(summary.unreconciledRefundAmount??'0',currency)>0n)findings.add('NATIVE_REFUND_RETURN_UNRECONCILED',
      'Reconcile the saved verified outgoing transfer on this original receipt.',{receiptId:receipt.id,amount:summary.unreconciledRefundAmount});
  }
  function base(kind,id,customerId,amount,date) {
    return {kind,id,key:kind+'/'+id,customerId,customerName:snapshot.customers.find(row=>row.id===customerId)?.name??null,
      amount,currency:clone(currency),date,matchedAmount:money(0n,currency),remainingAmount:amount,
      _units:minor(amount,currency),_used:0n};
  }
  for(const row of snapshot.allocations) {
    const receipt=receipts.get(row.receiptId),invoice=invoices.get(row.invoiceId);
    if(!receipt||!invoice||!sameCurrency(receipt.currency,currency)||!allocationActive(row,asOf)||
      (receipt.accountingDate??receipt.receivedDate)>asOf||receipt.voidDate&&receipt.voidDate<=asOf||
      invoice.voidDate&&invoice.voidDate<=asOf)continue;
    add({...base('ALLOCATION',row.id,receipt.customerId,row.amount,row.allocatedDate),
      accountingRole:'ACTIVE_ALLOCATION',invoiceId:row.invoiceId,documentNumber:invoice.number,receiptId:row.receiptId,
      reference:receipt.reference,receivedDate:receipt.receivedDate,accountingDate:receipt.accountingDate??receipt.receivedDate,
      releasedDate:row.releasedDate??null,replacesAllocationId:row.replacesAllocationId??null,
      dispositionId:row.dispositionId??null,receipt:receiptBrief(receipt),receiptLineageKey:receipt.id,sourceSha256:digest(row)});
  }
  for(const row of snapshot.credits)if(sameCurrency(row.document?.currency,currency)&&row.document.creditDate<=asOf) {
    const doc=row.document;
    add({...base('CREDIT_NOTE',row.id,doc.customerId??doc.customer?.id,doc.totals.total,doc.creditDate),
      accountingRole:'ISSUED_CREDIT',invoiceId:row.invoiceId,documentNumber:row.number,reference:row.number,
      sourceSha256:row.files?.['credit-note.json']?.sha256??row.files?.['credit.json']?.sha256??digest(doc)});
  }
  for(const row of snapshot.refunds??[])if(sameCurrency(row.proposal?.currency,currency)) {
    const summary=refundAccountSummary(row,asOf);
    if(minor(summary.refunded,currency)<=0n)continue;
    const receipt=receipts.get(summary.receiptId);
    add({...base('REFUND',row.id,summary.customerId,summary.refunded,summary.refundDate),
      accountingRole:'ACTUAL_REFUND',receiptId:summary.receiptId,reference:summary.reference??summary.transaction,
      accountingDate:summary.accountingDate,effectiveDate:summary.effectiveDate,
      receipt:receipt?receiptBrief(receipt):null,receiptLineageKey:summary.receiptId,
      transaction:summary.transaction,replacesRefundId:summary.replacesRefundId,sourceSha256:digest(row)});
  }
  const ancestry=id=>{
    const result=[],seen=new Set();
    while(id&&!seen.has(id)){seen.add(id);const row=allocations.get(id);if(!row)break;result.push(row);id=row.replacesAllocationId;}
    return result;
  };
  function fundingPlan(owner,kind) {
    const p=owner.proposal;
    if(!p||!sameCurrency(p.currency,currency)||p.effectiveDate>asOf)return;
    const eligibleRefund=kind==='REFUND'?byKey.get('REFUND/'+owner.id):null;
    if(kind==='REFUND'&&!eligibleRefund)return;
    const byInvoice=new Map();
    for(const funding of p.funding??[]) {
      const allocation=allocations.get(funding.allocationId),receipt=receipts.get(p.receiptId);
      if(!allocation||!receipt||allocation.receiptId!==p.receiptId||allocation.invoiceId!==funding.invoiceId||
        allocation.releasedDate!==p.effectiveDate||allocationActive(allocation,asOf))continue;
      if(!byInvoice.has(funding.invoiceId))byInvoice.set(funding.invoiceId,[]);
      byInvoice.get(funding.invoiceId).push({allocationId:allocation.id,amount:funding.amount,
        originalAmount:funding.originalAmount,allocatedDate:funding.allocatedDate,
        previousReleasedDate:funding.previousReleasedDate??null,replacementAllocationId:funding.replacementAllocationId??null,
        replacementAmount:funding.replacementAmount,originalSha256:funding.originalSha256});
    }
    for(const [invoiceId,funding]of byInvoice) {
      const id=kind+'/'+owner.id+'/'+invoiceId,amount=funding.reduce((sum,row)=>sum+minor(row.amount,currency),0n);
      const group={id,kind,ownerId:owner.id,invoiceId,receiptId:p.receiptId,customerId:p.customerId,effectiveDate:p.effectiveDate,
        amount:money(amount,currency),funding,sourceSha256:digest(p),_units:amount};
      groups.set(id,group);
      if(kind==='REFUND') {
        if(!refundGroups.has(owner.id))refundGroups.set(owner.id,[]);
        refundGroups.get(owner.id).push(group);
      }
      for(const f of funding) {
        const key='ALLOCATION/'+f.allocationId,original=allocations.get(f.allocationId),receipt=receipts.get(p.receiptId);
        let row=byKey.get(key);
        if(!row) {
          row={...base('ALLOCATION',f.allocationId,p.customerId,f.amount,f.allocatedDate),
            accountingRole:'DISPOSITION_FUNDING',originalAmount:f.originalAmount,invoiceId,receiptId:p.receiptId,
            documentNumber:invoices.get(invoiceId)?.number??null,reference:receipt.reference,
            releasedDate:original.releasedDate,receipt:receiptBrief(receipt),receiptLineageKey:receipt.id,
            fundingGroups:[],requiresRepresentationBridge:true,sourceSha256:digest(original)};
          add(row);
        }
        row.fundingGroups.push({groupId:id,kind,ownerId:owner.id,amount:f.amount,effectiveDate:p.effectiveDate});
      }
      if(kind==='DISPOSITION')for(const target of p.allocations??[]) {
        const current=rows.filter(row=>row.kind==='ALLOCATION'&&row.accountingRole==='ACTIVE_ALLOCATION'&&
          row.receiptId===p.receiptId&&row.invoiceId===target.invoiceId&&ancestry(row.id).some(item=>item.id===target.allocationId));
        for(const row of current) {
          if(!targets.has(row.id))targets.set(row.id,[]);
          targets.get(row.id).push({groupId:id,dispositionId:owner.id,targetAllocationId:row.id,
            originalTargetAllocationId:target.allocationId,invoiceId:row.invoiceId,sourceInvoiceId:invoiceId,
            effectiveDate:p.effectiveDate,amount:row.amount,originalTargetAmount:target.amount});
        }
      }
    }
  }
  for(const row of snapshot.creditDispositions??[])fundingPlan(row,'DISPOSITION');
  for(const row of snapshot.refunds??[])fundingPlan(row,'REFUND');
  for(const row of rows)if(row.kind==='ALLOCATION'&&targets.has(row.id))row.dispositionAssociations=clone(targets.get(row.id));
  return {rows:rows.sort((a,b)=>cmp(keyOf(a),keyOf(b))),byKey,groups,targets,refundGroups,lineage,invoices,receipts,credits,allocations};
}
function cashMatches(provider,native,selection,currency,asOf,findings) {
  const entries=provider.entries,entryIndex=new Map(entries.map(row=>[row.key,row])),decisions=[];
  const resources=new Map(),resourceUse=new Map(),bridges=[],usedSourceAllocationIds=new Map();
  const reserve=(id,units)=>{if(!resources.has(id))resources.set(id,units);else resources.set(id,resources.get(id)<units?resources.get(id):units);};
  for(const row of native.rows)reserve('NATIVE/'+keyOf(row),row._units);
  for(const group of native.groups.values())reserve('GROUP/'+group.id,group._units);
  const bridgeFor=(entry,row)=>{
    const credit=native.byKey.get('CREDIT_NOTE/'+entry.creditId);
    if(!credit||credit.customerId!==entry.customerId||credit.date>asOf)return [];
    if(entry.kind==='CREDIT_APPLICATION') {
      const targets=row.kind==='ALLOCATION'?[row]:
        native.rows.filter(item=>item.kind==='ALLOCATION'&&item.accountingRole==='ACTIVE_ALLOCATION'&&item.invoiceId===entry.documentId);
      return targets.flatMap(target=>(native.targets.get(target.id)??[]).filter(link=>link.sourceInvoiceId===credit.invoiceId&&
        credit.date<=link.effectiveDate).map(link=>({kind:'CREDIT_DISPOSITION',creditId:credit.id,sourceInvoiceId:credit.invoiceId,
          targetInvoiceId:target.invoiceId,targetAllocationId:target.id,groupId:link.groupId,dispositionId:link.dispositionId,
          effectiveDate:link.effectiveDate,sourceAllocationIds:native.groups.get(link.groupId).funding.map(item=>item.allocationId),
          receiptId:target.receiptId})));
    }
    if(entry.kind==='REFUND'&&row.kind==='REFUND')return (native.refundGroups.get(row.id)??[])
      .filter(group=>group.invoiceId===credit.invoiceId&&credit.date<=group.effectiveDate)
      .map(group=>({kind:'CREDIT_REFUND',creditId:credit.id,sourceInvoiceId:credit.invoiceId,targetInvoiceId:null,
        targetAllocationId:null,groupId:group.id,refundId:row.id,effectiveDate:group.effectiveDate,
        sourceAllocationIds:group.funding.map(item=>item.allocationId),receiptId:row.receiptId}));
    return [];
  };
  function candidates(entry) {
    if(!entry._usable||!entry.customerId)return [];
    return native.rows.filter(row=>{
      if(row.customerId!==entry.customerId||!sameCurrency(row.currency,entry.currency))return false;
      if(['PAYMENT','PREPAYMENT_APPLICATION','OVERPAYMENT_APPLICATION'].includes(entry.kind))
        return row.kind==='ALLOCATION'&&row.invoiceId===entry.documentId&&
          (row.accountingRole!=='DISPOSITION_FUNDING'||entry.kind==='PAYMENT');
      if(entry.kind==='REFUND')return row.kind==='REFUND'&&
        (entry.sourceKind!=='CREDIT_NOTE'||bridgeFor(entry,row).length>0);
      if(entry.kind==='CREDIT_APPLICATION')return row.kind==='CREDIT_NOTE'&&row.id===entry.creditId&&
        (row.invoiceId===entry.documentId||bridgeFor(entry,row).length>0)||
        row.kind==='ALLOCATION'&&row.invoiceId===entry.documentId&&bridgeFor(entry,row).length>0;
      return false;
    }).map(keyOf);
  }
  for(const entry of entries)entry.candidateKeys=candidates(entry);
  for(const selected of selection.matches) {
    const entry=entryIndex.get(selected.entryKey),decision={selected,entry,errors:[],uses:new Map(),bridges:[],funding:new Map(),units:0n};
    decisions.push(decision);
    const fail=(code,message,details={})=>{decision.errors.push(code);findings.add(code,message,{entryKey:selected.entryKey,...details});};
    if(!entry){fail('CASH_MATCH_SOURCE_NOT_OBSERVED','Remove or update this retained match: its source entry is absent from the selected responses.');continue;}
    if(!entry._usable){fail('CASH_MATCH_SOURCE_UNAVAILABLE','Resolve this original source state before using its cash match.');continue;}
    const use=(id,units)=>decision.uses.set(id,(decision.uses.get(id)??0n)+units);
    for(const portion of selected.native) {
      const key=keyOf(portion),row=native.byKey.get(key),units=minor(portion.amount,currency);
      decision.units+=units;
      if(!row||!entry.candidateKeys.includes(key)){fail('CASH_MATCH_NATIVE_RELATION','Choose an eligible original ledger row for this exact source entry.',{nativeKey:key});continue;}
      if((!entry.date||entry.date!==row.date)&&!selected.dateDifferenceReason)
        fail('CASH_MATCH_DATE_REASON','Keep an explanation when the provider and native cash dates differ or the application date was not supplied.',{nativeKey:key,providerDate:entry.date,nativeDate:row.date});
      use('NATIVE/'+key,units);
      if(row.accountingRole==='DISPOSITION_FUNDING') {
        for(const group of row.fundingGroups??[])decision.funding.set(group.groupId,(decision.funding.get(group.groupId)??0n)+units);
      }
      let possible=[];
      if(entry.kind==='CREDIT_APPLICATION'&&!(row.kind==='CREDIT_NOTE'&&row.invoiceId===entry.documentId))possible=bridgeFor(entry,row);
      if(entry.kind==='REFUND'&&entry.sourceKind==='CREDIT_NOTE')possible=bridgeFor(entry,row);
      if(possible.length) {
        if(possible.length!==1){fail('CASH_DISPOSITION_AMBIGUOUS','Select the exact target allocation to identify one original disposition.',{nativeKey:key,associations:possible});continue;}
        const bridge={...possible[0],entryKey:entry.key,amount:portion.amount,_units:units};
        decision.bridges.push(bridge);
        if(row.kind!=='CREDIT_NOTE')use('NATIVE/CREDIT_NOTE/'+bridge.creditId,units);
        if(bridge.targetAllocationId&&!(row.kind==='ALLOCATION'&&row.id===bridge.targetAllocationId))use('NATIVE/ALLOCATION/'+bridge.targetAllocationId,units);
        use('GROUP/'+bridge.groupId,units);
      }
    }
    if(decision.units>entry._units)fail('CASH_MATCH_EXCEEDS_SOURCE','The matched portions exceed this exact original source amount.',
      {sourceAmount:entry.amount,matchedAmount:money(decision.units,currency)});
    for(const id of entry.allocationIds??[]) {
      if(!usedSourceAllocationIds.has(id))usedSourceAllocationIds.set(id,[]);
      usedSourceAllocationIds.get(id).push(decision);
    }
  }
  for(const [id,values]of usedSourceAllocationIds)if(new Set(values.map(row=>row.entry.key)).size>1)for(const decision of values) {
    decision.errors.push('SOURCE_ALLOCATION_REUSED');
    findings.add('SOURCE_ALLOCATION_REUSED','One original Xero AllocationID appears in multiple selected applications.',
      {entryKey:decision.entry.key,allocationId:id});
  }
  for(const decision of decisions)if(!decision.errors.length)for(const [key,units]of decision.uses) {
    if(!resourceUse.has(key))resourceUse.set(key,[]);resourceUse.get(key).push({decision,units});
  }
  for(const [key,uses]of resourceUse) {
    const total=uses.reduce((sum,row)=>sum+row.units,0n),available=resources.get(key)??0n;
    if(total>available)for(const {decision}of uses) {
      decision.errors.push('CASH_MATCH_CAPACITY');
      findings.add('CASH_MATCH_CAPACITY','Combined source matches exceed one original ledger or disposition capacity.',
        {entryKey:decision.entry.key,resource:key,available:money(available,currency),requested:money(total,currency)});
    }
  }
  const bridgeBudget=new Map(),fundingUses=new Map();
  for(const decision of decisions)if(!decision.errors.length) {
    for(const bridge of decision.bridges)bridgeBudget.set(bridge.groupId,(bridgeBudget.get(bridge.groupId)??0n)+bridge._units);
    for(const [key,units]of decision.funding) {
      if(!fundingUses.has(key))fundingUses.set(key,[]);
      fundingUses.get(key).push({decision,units});
    }
  }
  for(const [key,uses]of fundingUses) {
    const units=uses.reduce((sum,row)=>sum+row.units,0n),budget=bridgeBudget.get(key)??0n;
    if(units>budget)for(const {decision}of uses) {
      decision.errors.push('CREDIT_RELEASE_BRIDGE_REQUIRED');
      findings.add('CREDIT_RELEASE_BRIDGE_REQUIRED','Match the corresponding original credit disposition or refund before representing this released cash.',
        {entryKey:decision.entry.key,fundingGroup:key,releasedCash:money(units,currency),representedCredit:money(budget,currency)});
    }
  }
  for(const decision of decisions) {
    if(!decision.entry)continue;
    const entry=decision.entry;entry.native=clone(decision.selected.native);entry.dateDifferenceReason=decision.selected.dateDifferenceReason;
    if(decision.errors.length){entry.status='MATCH_REVIEW_REQUIRED';entry.message='Correct the retained matching decision using the exact original rows.';continue;}
    entry.matchedAmount=money(decision.units,currency);entry.remainingAmount=money(entry._units-decision.units,currency);
    entry.status=decision.units===entry._units?'MATCHED':'PARTIALLY_MATCHED';
    entry.message=entry.status==='MATCHED'?'Original source and ledger portions are fully matched.':'An exact source portion remains to match.';
    for(const [key,units]of decision.uses)if(key.startsWith('NATIVE/')) {
      const row=native.byKey.get(key.slice(7));if(row)row._used+=units;
    }
    for(const bridge of decision.bridges)bridges.push(bridge);
    entry.representationBridges=decision.bridges.map(({_units,...row})=>row);
  }
  for(const row of native.rows){row.matchedAmount=money(row._used,currency);row.remainingAmount=money(row._units-row._used,currency);}
  for(const entry of entries)if(entry._usable&&entry.status==='UNMATCHED')findings.add('CASH_ENTRY_UNMATCHED',
    'Match this original source cash to its exact native customer entries.',{entryKey:entry.key,amount:entry.amount,documentId:entry.documentId});
  return {bridges,decisions};
}


function invoiceField(rows,key,currency) {
  if(!rows.length)return {present:false,valid:false,amount:null,observations:[]};
  const latest=fieldObservation(rows,ob=>{
    const read=moneyField(ob.row,key,currency,ob);
    return read.present?{valid:read.valid,amount:read.amount,reason:read.reason??null}:undefined;
  });
  return {present:latest.present,valid:latest.present&&!latest.conflict&&latest.value?.valid===true,
    amount:latest.conflict?null:latest.value?.amount??null,conflict:latest.conflict,observedAt:latest.observedAt,
    observations:latest.rows.filter(ob=>has(ob.row,key)).map(ob=>({...origin(ob),field:moneyField(ob.row,key,currency,ob)}))};
}
function invoiceCollection(rows,key,idField) {
  const latest=fieldObservation(rows,ob=>has(ob.row,key)?Array.isArray(ob.row[key])?
    ob.row[key].map(item=>uid(item?.[idField])).sort():{invalid:true}:undefined);
  return {present:latest.present,valid:latest.present&&!latest.conflict&&Array.isArray(latest.value)&&latest.value.every(Boolean)&&new Set(latest.value).size===latest.value.length,
    ids:Array.isArray(latest.value)?latest.value:[],conflict:latest.conflict,observedAt:latest.observedAt,
    sources:latest.sources};
}
function auditSourceBalances(index,provider,currency,findings) {
  for(const source of provider.cashSources) {
    if(!['PREPAYMENT','OVERPAYMENT'].includes(source.kind)||!source.customerId||source.status==='VOIDED')continue;
    if(!ACTIVE_DOCUMENTS.has(source.status)) {
      findings.add('XERO_CASH_SOURCE_STATUS_REQUIRED','Retain the original authorised, paid or voided source status.',
        {kind:source.kind,externalId:source.externalId,customerId:source.customerId,status:source.status});continue;
    }
    const rows=index.headers.get(source.kind+'/'+source.externalId)??[];
    const allocations=fieldObservation(rows,ob=>{
      if(!has(ob.row,'Allocations'))return undefined;
      if(!Array.isArray(ob.row.Allocations))return {valid:false,amount:null,ids:[],errors:['INVALID_ALLOCATION_COLLECTION']};
      let units=0n;const ids=[],seen=new Set(),errors=[];
      for(const [i,row]of ob.row.Allocations.entries()) {
        const id=uid(row?.AllocationID),child={...ob,pointer:pointer(pointer(ob.pointer,'Allocations'),i)};
        if(!plain(row)||!id||seen.has(id)){errors.push('ALLOCATION_ID_MISSING_OR_REUSED');continue;}
        seen.add(id);
        if(row.IsDeleted===true)continue;
        const amount=moneyField(row,'Amount',currency,child),date=dateField(row,child);
        if(row.IsDeleted!==false||!amount.valid||!date.valid||!uid(row.Invoice?.InvoiceID)) {
          errors.push('ALLOCATION_FIELDS_MISSING');continue;
        }
        ids.push(id);units+=minor(amount.amount,currency);
      }
      return {valid:errors.length===0,amount:errors.length?null:money(units,currency),ids:ids.sort(),errors:sorted(new Set(errors))};
    });
    const payments=fieldObservation(rows,ob=>{
      if(!has(ob.row,'Payments'))return undefined;
      if(!Array.isArray(ob.row.Payments))return {valid:false,ids:[]};
      const ids=ob.row.Payments.map(row=>uid(row?.PaymentID)).sort();
      return {valid:ids.every(Boolean)&&new Set(ids).size===ids.length,ids};
    });
    const knownFields=source.totalEvidence?.valid&&source.remainingCreditEvidence?.valid,
      complete=knownFields&&allocations.present&&!allocations.conflict&&allocations.value?.valid&&
        payments.present&&!payments.conflict&&payments.value?.valid;
    const detail={kind:source.kind,externalId:source.externalId,customerId:source.customerId,
      total:source.total,remainingCredit:source.remainingCredit,
      totalObservedAt:source.totalEvidence?.observedAt??null,remainingObservedAt:source.remainingCreditEvidence?.observedAt??null,
      allocationsObservedAt:allocations.observedAt??null,paymentsObservedAt:payments.observedAt??null};
    if(!complete) {
      findings.add('XERO_CASH_SOURCE_COMPONENTS_MISSING',
        'Retain the complete original source Total, RemainingCredit, Allocations and Payments before reconciling its unused customer cash.',
        {...detail,missingFields:[...(!source.totalEvidence?.valid?['Total']:[]),...(!source.remainingCreditEvidence?.valid?['RemainingCredit']:[]),
          ...(!(allocations.present&&!allocations.conflict&&allocations.value?.valid)?['Allocations']:[]),
          ...(!(payments.present&&!payments.conflict&&payments.value?.valid)?['Payments']:[])]});
      continue;
    }
    if(source.remainingCreditEvidence.observedAt!==allocations.observedAt||allocations.observedAt!==payments.observedAt) {
      findings.add('XERO_CASH_SOURCE_OBSERVATION_TIMES',
        'Use an original response that observes remaining credit, allocations and refund payments together.',
        detail);continue;
    }
    let refunded=0n;const missing=[];
    for(const id of payments.value.ids) {
      const row=provider.entries.find(item=>item.paymentId===id&&item.kind==='REFUND'&&
        item.sourceKind===source.kind&&item.sourceExternalId===source.externalId);
      if(!row||row.amount===null||row._problems.length||!['AUTHORISED','DELETED'].includes(row.providerStatus))missing.push(id);
      else if(row.providerStatus==='AUTHORISED')refunded+=minor(row.amount,currency);
    }
    if(missing.length) {
      findings.add('XERO_CASH_SOURCE_REFUNDS_MISSING',
        'Retain the exact original authorised or deleted refund record for every source Payments ID.',
        {...detail,missingPaymentIds:missing});continue;
    }
    const applied=minor(allocations.value.amount,currency),remaining=minor(source.remainingCredit,currency),
      total=minor(source.total,currency),accounted=applied+refunded+remaining;
    if(total!==accounted)findings.add('XERO_CASH_SOURCE_BALANCE_DIFFERENCE',
      'The original source allocations, authorised refunds and remaining credit do not sum to its total.',
      {...detail,applied:money(applied,currency),refunded:money(refunded,currency),
        accounted:money(accounted,currency),difference:money(accounted-total,currency)});
  }
}
function documentReviews(index,bindings,provider,native,matches,snapshot,currency,asOf,findings) {
  const output=[],projection=new Map();
  const adjust=(id,paid,credited,bridge)=>{
    if(!projection.has(id))projection.set(id,{paid:0n,credited:0n,bridges:[]});
    const value=projection.get(id);value.paid+=paid;value.credited+=credited;value.bridges.push(bridge);
  };
  for(const bridge of matches.bridges) {
    adjust(bridge.sourceInvoiceId,bridge._units,-bridge._units,bridge);
    if(bridge.targetInvoiceId)adjust(bridge.targetInvoiceId,-bridge._units,bridge._units,bridge);
  }
  const entrySum=(documentId,kind,collection)=>{
    const rows=provider.entries.filter(row=>row.documentId===documentId&&row.kind===kind);
    const byId=new Map(rows.map(row=>[row.externalId,row]));
    let known=0n;const missing=[];
    if(!collection.valid)return {amount:null,knownAmount:money(rows.filter(row=>row.amount!==null).reduce((sum,row)=>sum+minor(row.amount,currency),0n),currency),
      complete:false,missingIds:[],entryKeys:rows.map(row=>row.key)};
    for(const id of collection.ids) {
      const row=byId.get(id);
      if(!row||row.amount===null||row._problems.length||row.status==='VOIDED')missing.push(id);
      else if(kind==='PAYMENT'&&row.providerStatus==='DELETED')continue;
      else if(kind==='PAYMENT'&&row.providerStatus!=='AUTHORISED')missing.push(id);
      else known+=minor(row.amount,currency);
    }
    return {amount:missing.length?null:money(known,currency),knownAmount:money(known,currency),complete:missing.length===0,
      missingIds:missing,entryKeys:collection.ids.map(id=>byId.get(id)?.key).filter(Boolean)};
  };
  for(const document of bindings.documents.values()) {
    if(document.kind!=='INVOICE')continue;
    const original=native.invoices.get(document.id);
    if(!original)continue;
    const nativeSummary=invoiceSummary(original,snapshot,asOf),rows=index.invoices.get(document.externalDocumentId)??[];
    const fields=Object.fromEntries(['Total','AmountPaid','AmountCredited','AmountDue'].map(key=>[key,invoiceField(rows,key,currency)]));
    const collections={
      payments:invoiceCollection(rows,'Payments','PaymentID'),
      credits:invoiceCollection(rows,'CreditNotes','CreditNoteID'),
      prepayments:invoiceCollection(rows,'Prepayments','PrepaymentID'),
      overpayments:invoiceCollection(rows,'Overpayments','OverpaymentID')
    };
    const currentStatus=fieldObservation(rows,ob=>has(ob.row,'Status')?ob.row.Status:undefined);
    const providerCurrency=fieldObservation(rows,ob=>has(ob.row,'CurrencyCode')?ob.row.CurrencyCode:undefined);
    const payments=entrySum(document.id,'PAYMENT',collections.payments),
      prepay=entrySum(document.id,'PREPAYMENT_APPLICATION',collections.prepayments),
      overpay=entrySum(document.id,'OVERPAYMENT_APPLICATION',collections.overpayments),
      credit=entrySum(document.id,'CREDIT_APPLICATION',collections.credits);
    const shift=projection.get(document.id)??{paid:0n,credited:0n,bridges:[]};
    const expectedPaid=minor(nativeSummary.paid,currency)+shift.paid,
      expectedCredit=minor(nativeSummary.credited,currency)+shift.credited;
    need(expectedPaid>=0n&&expectedCredit>=0n,'XERO_CASH_REPRESENTATION_CONSERVATION',
      'The original disposition representation exceeds this invoice cash or credit.',409);
    const compared={paid:money(expectedPaid,currency),credited:money(expectedCredit,currency),amountDue:nativeSummary.amountDue,
      basis:shift.bridges.length?'ORIGINAL_CREDIT_DISPOSITION':'ORIGINAL_NATIVE_LEDGER',
      bridges:shift.bridges.map(({_units,...row})=>row)};
    const paid=fields.AmountPaid.valid&&prepay.complete&&overpay.complete?
      minor(fields.AmountPaid.amount,currency)+minor(prepay.amount,currency)+minor(overpay.amount,currency):null;
    const credited=credit.complete?minor(credit.amount,currency):null;
    const aggregateCredit=credit.complete&&prepay.complete&&overpay.complete?
      minor(credit.amount,currency)+minor(prepay.amount,currency)+minor(overpay.amount,currency):null;
    const differences=[];
    const compare=(field,providerUnits,nativeUnits)=>{
      if(providerUnits!==null&&providerUnits!==nativeUnits)differences.push({field,native:money(nativeUnits,currency),
        provider:money(providerUnits,currency),difference:money(providerUnits-nativeUnits,currency)});
    };
    compare('paidCash',paid,expectedPaid);compare('creditNotesApplied',credited,expectedCredit);
    compare('amountDue',fields.AmountDue.valid?minor(fields.AmountDue.amount,currency):null,minor(nativeSummary.amountDue,currency));
    compare('total',fields.Total.valid?minor(fields.Total.amount,currency):null,minor(nativeSummary.total,currency));
    if(fields.AmountPaid.valid&&payments.complete&&minor(fields.AmountPaid.amount,currency)!==minor(payments.amount,currency)) {
      differences.push({field:'directPaymentComponents',declared:fields.AmountPaid.amount,components:payments.amount,
        difference:money(minor(payments.amount,currency)-minor(fields.AmountPaid.amount,currency),currency)});
      findings.add('XERO_PAYMENT_COMPONENT_DIFFERENCE','The exact authorised Payments IDs do not sum to the original invoice AmountPaid.',
        {documentId:document.id,documentNumber:document.number,amountPaid:fields.AmountPaid.amount,authorisedPayments:payments.amount,
          paymentIds:collections.payments.ids});
    }
    if(!payments.complete)findings.add('XERO_PAYMENT_COMPONENT_MISSING','Retain the complete original record for every payment listed by this invoice.',
      {documentId:document.id,documentNumber:document.number,missingPaymentIds:payments.missingIds});
    if(fields.AmountCredited.valid&&aggregateCredit!==null&&minor(fields.AmountCredited.amount,currency)!==aggregateCredit) {
      differences.push({field:'creditedComponents',declared:fields.AmountCredited.amount,components:money(aggregateCredit,currency),
        difference:money(aggregateCredit-minor(fields.AmountCredited.amount,currency),currency)});
      findings.add('XERO_CREDIT_CLASSIFICATION_DIFFERENCE','The original aggregate credited amount differs from the retained credit/prepayment/overpayment applications.',
        {documentId:document.id,documentNumber:document.number,amountCredited:fields.AmountCredited.amount,classified:money(aggregateCredit,currency)});
    }
    const incomplete=Object.values(fields).some(row=>!row.valid)||Object.values(collections).some(row=>!row.valid)||
      !payments.complete||!prepay.complete||!overpay.complete||!credit.complete;
    if(incomplete)findings.add('XERO_INVOICE_CASH_FIELDS_MISSING',
      'Retain the original invoice cash amounts and explicit Payments, CreditNotes, Prepayments and Overpayments collections.',
      {documentId:document.id,documentNumber:document.number,
        missingFields:Object.entries(fields).filter(([,row])=>!row.valid).map(([key])=>key),
        missingCollections:Object.entries(collections).filter(([,row])=>!row.valid).map(([key])=>key)});
    if(providerCurrency.value!==currency.code)findings.add('XERO_INVOICE_CURRENCY_REQUIRED',
      'Keep the exact original invoice currency in the cash response.',{documentId:document.id,documentNumber:document.number,sourceCurrency:providerCurrency.value??null});
    const docEntries=provider.entries.filter(row=>row.documentId===document.id);
    const unresolved=docEntries.some(row=>!['MATCHED','NO_CASH','DELETED','VOIDED'].includes(row.status));
    const sourceReady=rows.length>0&&ACTIVE_DOCUMENTS.has(currentStatus.value)&&!currentStatus.conflict&&
      providerCurrency.value===currency.code&&document.bindingStatus==='IMPORTED';
    const status=differences.length?'DIFFERENCES':!sourceReady||incomplete||unresolved?'REVIEW_REQUIRED':'MATCHED';
    if(differences.length)findings.add('CUSTOMER_CASH_DIFFERENCE','Review the original customer cash differences for this invoice.',
      {documentId:document.id,documentNumber:document.number,differences});
    const observedAt=rows.map(row=>row.source.observedAt).sort().at(-1)??null;
    output.push({id:document.id,documentId:document.id,kind:'INVOICE',number:document.number,customerId:document.customerId,
      customerName:document.customerName,currency:clone(currency),packageIds:document.packageIds,
      externalDocumentId:document.externalDocumentId,bindingStatus:document.bindingStatus,
      sourceSha256:document.sourceSha256,native:nativeSummary,comparison:compared,
      provider:{status:currentStatus.value??null,currencyCode:providerCurrency.value??null,observedAt,
        directPayments:fields.AmountPaid.amount,amountPaid:fields.AmountPaid.amount,amountCredited:fields.AmountCredited.amount,
        prepaymentApplied:prepay.amount,overpaymentApplied:overpay.amount,creditNotesApplied:credit.amount,
        amountDue:fields.AmountDue.amount,total:fields.Total.amount,paidCash:paid===null?null:money(paid,currency),
        fields,collections,paymentComponents:payments,applications:{prepayments:prepay,overpayments:overpay,creditNotes:credit}},
      differences,status,message:status==='MATCHED'?'Original balances and reviewed cash portions agree.':
        status==='DIFFERENCES'?'The retained observations show exact customer cash differences.':'Complete the displayed source fields and original matching decisions.',
      comparisonScope:{nativeAsOf:asOf,providerObservedAt:observedAt,
        timing:observedAt?observedAt.slice(0,10)===asOf?'SAME_DATE':observedAt.slice(0,10)>asOf?'LATER_PROVIDER_OBSERVATION':'EARLIER_PROVIDER_OBSERVATION':'NOT_OBSERVED',
        description:'Provider balances remain those in the original observation; the native ledger uses the selected account date.'}});
  }
  for(const document of bindings.documents.values())if(document.kind==='CREDIT_NOTE') {
    const row=native.byKey.get('CREDIT_NOTE/'+document.id),source=provider.cashSources.find(item=>item.kind==='CREDIT_NOTE'&&item.externalId===document.externalDocumentId);
    if(!row)continue;
    const applied=provider.entries.filter(item=>item.kind==='CREDIT_APPLICATION'&&item.creditId===document.id&&item.amount!==null),
      refunds=provider.entries.filter(item=>item.kind==='REFUND'&&item.creditId===document.id&&item.amount!==null&&item.providerStatus==='AUTHORISED');
    const appliedUnits=applied.reduce((sum,item)=>sum+minor(item.amount,currency),0n),
      refundedUnits=refunds.reduce((sum,item)=>sum+minor(item.amount,currency),0n);
    const differences=[];
    if(source?.total!==null&&source?.total!==undefined&&minor(source.total,currency)!==row._units)
      differences.push({field:'total',native:row.amount,provider:source.total,difference:money(minor(source.total,currency)-row._units,currency)});
    if(source?.total!==null&&source?.total!==undefined&&source.remainingCredit!==null&&
      minor(source.total,currency)!==appliedUnits+refundedUnits+minor(source.remainingCredit,currency))
      findings.add('XERO_CREDIT_SOURCE_REMAINDER','The selected applications, refunds and remaining credit do not cover the original source total.',
        {documentId:document.id,documentNumber:document.number,total:source.total,applied:money(appliedUnits,currency),
          refunded:money(refundedUnits,currency),remainingCredit:source.remainingCredit});
    const complete=source&&source.totalEvidence?.valid&&source.remainingCreditEvidence?.valid&&
      ACTIVE_DOCUMENTS.has(source.status)&&[...applied,...refunds].every(item=>['MATCHED','NO_CASH'].includes(item.status));
    output.push({id:document.id,documentId:document.id,kind:'CREDIT_NOTE',number:document.number,customerId:document.customerId,
      customerName:document.customerName,currency:clone(currency),packageIds:document.packageIds,
      externalDocumentId:document.externalDocumentId,bindingStatus:document.bindingStatus,sourceSha256:document.sourceSha256,
      native:{total:row.amount,paid:null,credited:row.amount,amountDue:null,matched:row.matchedAmount,unrepresented:row.remainingAmount},
      provider:{status:source?.status??null,total:source?.total??null,remainingCredit:source?.remainingCredit??null,
        creditNotesApplied:money(appliedUnits,currency),refunds:money(refundedUnits,currency),amountDue:null,
        totalEvidence:source?.totalEvidence??{present:false},remainingCreditEvidence:source?.remainingCreditEvidence??{present:false}},
      differences,status:differences.length?'DIFFERENCES':complete?'MATCHED':'REVIEW_REQUIRED',
      message:'Original credit face, invoice applications, refunds and unused source credit remain separate.'});
  }
  return output.sort((a,b)=>cmp(a.number,b.number)||cmp(a.id,b.id));
}
function cycleChanges(baseline,review,snapshot,currency,asOf) {
  if(!baseline)return {baseline:null,changes:[]};
  const changes=[],previous=baseline.review;
  const add=(kind,key,before,after,details={})=>{if(json(canonical(before))!==json(canonical(after)))changes.push({kind,key,before,after,...details});};
  const docView=row=>row?{externalDocumentId:row.externalDocumentId,status:row.status,native:row.native,comparison:row.comparison??null,
    provider:Object.fromEntries(['status','observedAt','directPayments','amountPaid','amountCredited','prepaymentApplied',
      'overpaymentApplied','creditNotesApplied','amountDue','total','remainingCredit','refunds'].map(key=>[key,row.provider?.[key]??null]))}:null;
  const beforeDocs=new Map((previous.documents??[]).map(row=>[row.id??row.documentId,row]));
  for(const document of review.documents){const prior=beforeDocs.get(document.id);beforeDocs.delete(document.id);
    add(prior?'DOCUMENT_CHANGED':'DOCUMENT_ADDED',document.id,docView(prior),docView(document),{documentNumber:document.number});}
  for(const [id,document]of beforeDocs)add('DOCUMENT_NOT_SELECTED',id,docView(document),null,{documentNumber:document.number});
  const entryView=row=>row?{kind:row.kind,status:row.status,providerStatus:row.providerStatus,amount:row.amount,date:row.date,
    observedAt:row.observedAt,bankAmount:row.bankAmount??null,isReconciled:row.isReconciled??null,
    documentId:row.documentId,native:row.native??[],matchedAmount:row.matchedAmount,
    representationBridges:row.representationBridges??[],sourceSha256:sorted(new Set((row.sources??[]).map(item=>item.sourceSha256)))}:null;
  const beforeEntries=new Map((previous.entries??[]).map(row=>[row.key,row]));
  for(const entry of review.entries){const prior=beforeEntries.get(entry.key);beforeEntries.delete(entry.key);
    add(prior?'CASH_ENTRY_CHANGED':'CASH_ENTRY_ADDED',entry.key,entryView(prior),entryView(entry),{documentId:entry.documentId});}
  for(const [key,row]of beforeEntries)add('CASH_ENTRY_NOT_OBSERVED',key,entryView(row),null,
    {message:'This original cash entry is absent from the current selected responses; absence is not deletion or zero.'});
  const receiptView=(row,data,date)=>{
    if(!row)return null;const summary=receiptSummary(row,data,date);
    return {...Object.fromEntries(['id','amount','receivedDate','accountingDate','voidDate','replacesReceiptId','replacementReceiptIds','replacementRole'].map(key=>[key,row[key]??null])),
      ...Object.fromEntries(['allocated','refunded','reserved','available','unreconciledRefundAmount'].map(key=>[key,summary[key]]))};
  };
  const beforeReceipts=new Map((baseline.snapshot?.receipts??[]).filter(row=>sameCurrency(row.currency,currency)).map(row=>[row.id,row]));
  for(const receipt of snapshot.receipts.filter(row=>sameCurrency(row.currency,currency))) {
    const prior=beforeReceipts.get(receipt.id);beforeReceipts.delete(receipt.id);
    add(prior?'NATIVE_RECEIPT_CHANGED':'NATIVE_RECEIPT_ADDED',receipt.id,
      prior?receiptView(prior,baseline.snapshot,baseline.cycle.asOf):null,receiptView(receipt,snapshot,asOf));
  }
  for(const [id,receipt]of beforeReceipts)add('NATIVE_RECEIPT_NOT_SELECTED',id,receiptView(receipt,baseline.snapshot,baseline.cycle.asOf),null);
  return {baseline:{cycleId:baseline.cycle.id,asOf:baseline.cycle.asOf,label:baseline.cycle.label,
    reviewSha256:previous.previewSha256,snapshotSha256:digest(baseline.snapshot)},changes};
}
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function csv(rows) {
  const cell=value=>{
    let text=value===null||value===undefined?'':typeof value==='object'?json(value).trim():String(value);
    if(/^[=+@\t\r-]/.test(text)&&exactDecimal(text)===null)text="'"+text;
    return '"'+text.replace(/"/g,'""')+'"';
  };
  return '\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
}
function reportFiles(review) {
  const documents=[['Document','Kind','Customer','Currency','Native paid','Native credit','Native due','Comparison paid','Comparison credit',
    'Xero direct payments','Xero prepayments applied','Xero overpayments applied','Xero credit notes applied','Xero due','Observed at','Native account date','Outcome']];
  for(const row of review.documents)documents.push([row.number,row.kind,row.customerName,row.currency.code,row.native.paid,row.native.credited,
    row.native.amountDue,row.comparison?.paid,row.comparison?.credited,row.provider.directPayments,row.provider.prepaymentApplied,
    row.provider.overpaymentApplied,row.provider.creditNotesApplied,row.provider.amountDue,row.provider.observedAt,review.asOf,row.status]);
  const entries=[['Entry key','Kind','Customer','Native invoice','External source','Amount','Currency','Date','Provider status','Bank amount',
    'Bank currency','Is reconciled','Outcome','Matched','Remaining','Native portions','Date explanation','Original source pointers']];
  for(const row of review.entries)entries.push([row.key,row.kind,row.customerName,row.documentId,row.externalId,row.amount,row.currency.code,row.date,
    row.providerStatus,row.bankAmount,row.bankCurrencyCode,row.isReconciled,row.status,row.matchedAmount,row.remainingAmount,row.native,row.dateDifferenceReason,row.sources]);
  const native=[['Kind','Original id','Accounting role','Customer','Invoice','Receipt','Amount','Date','Matched','Remaining','Original amount','Lineage']];
  for(const row of review.nativeRows)native.push([row.kind,row.id,row.accountingRole,row.customerName,row.invoiceId,row.receiptId,row.amount,row.date,
    row.matchedAmount,row.remainingAmount,row.originalAmount,row.receiptLineageKey]);
  const findings=[['Code','Severity','Message','Original details']];
  for(const row of review.findings)findings.push([row.code,row.severity,row.message,row]);
  const changes=[['Kind','Original key','Previous','Current']];
  for(const row of review.changes)changes.push([row.kind,row.key,row.before,row.after]);
  const table=(headers,rows)=>'<table><thead><tr>'+headers.map(value=>'<th>'+esc(value)+'</th>').join('')+
    '</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(value=>'<td>'+esc(typeof value==='object'&&value!==null?json(value).trim():value)+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
  const html='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<title>'+esc(review.label)+' — customer cash commissioning</title><style>'+
    'body{font:14px/1.5 system-ui,sans-serif;color:#202124;background:#fff;margin:32px;max-width:1600px}h1,h2{font-weight:600}'+
    'table{border-collapse:collapse;width:100%;margin:16px 0 28px;font-size:12px}th,td{border:1px solid #c8c8c8;padding:7px;text-align:left;vertical-align:top;overflow-wrap:anywhere}'+
    'th{background:#eee}code{font-size:12px;overflow-wrap:anywhere}.summary{border:1px solid #999;padding:14px}details{margin:12px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere}'+
    '@media print{body{margin:12mm}thead{display:table-header-group}tr{break-inside:avoid}h2{break-after:avoid}}'+
    '</style><h1>'+esc(review.label)+'</h1><p>'+esc(review.organisation)+' · '+esc(review.currency.code)+' · Native account date '+esc(review.asOf)+'</p>'+
    '<div class="summary"><strong>'+esc(review.status)+'</strong><p>'+esc(review.summary)+'</p>'+
    '<p>Provider balances retain their original observation dates. Applied prepaid and overpaid cash is distinguished from credit notes. Bank amounts and reconciliation flags remain original independent fields.</p></div>'+
    '<h2>Customer documents</h2>'+table(documents[0],documents.slice(1))+
    '<h2>Original cash entries</h2>'+table(entries[0],entries.slice(1))+
    '<h2>Original native ledger portions</h2>'+table(native[0],native.slice(1))+
    '<h2>Items to resolve</h2>'+table(findings[0],findings.slice(1))+
    '<h2>Changes from the saved cycle</h2>'+table(changes[0],changes.slice(1))+
    '<details><summary>Original bank and receipt lineage</summary><pre>'+esc(json(review.receiptLineage))+'</pre></details>'+
    '<p>Source fingerprint <code>'+esc(review.sourceFingerprint)+'</code><br>Review SHA-256 <code>'+esc(review.previewSha256)+'</code></p>'+
    '<p>Schema: <a href="'+esc(XERO_CASH_SOURCE_RULES.specification)+'">Xero Accounting OpenAPI '+esc(XERO_CASH_SOURCE_RULES.version)+'</a></p></html>';
  return [file('cash-review.json',review,'original-cash-review'),
    file('cash-documents.csv',csv(documents),'customer-cash-comparison','text/csv; charset=utf-8'),
    file('cash-entries.csv',csv(entries),'original-source-cash-entries','text/csv; charset=utf-8'),
    file('cash-native-rows.csv',csv(native),'original-native-cash-portions','text/csv; charset=utf-8'),
    file('cash-findings.csv',csv(findings),'cash-commissioning-actions','text/csv; charset=utf-8'),
    file('cash-cycle-changes.csv',csv(changes),'immutable-cash-cycle-comparison','text/csv; charset=utf-8'),
    file('cash-commissioning.html',html,'customer-cash-handover','text/html; charset=utf-8')];
}
function publicValue(value) {
  if(Array.isArray(value))return value.map(publicValue);
  if(plain(value))return Object.fromEntries(Object.entries(value).filter(([key])=>!key.startsWith('_')).map(([key,item])=>[key,publicValue(item)]));
  return value;
}
export function compileXeroCashCycle({package:anchor,packages=[anchor],resolutions=[],snapshot,sources,selection,baseline=null,attachmentDescriptors=[]}) {
  need(plain(anchor)&&Array.isArray(packages)&&packages.length>0&&plain(snapshot)&&Array.isArray(sources),
    'XERO_CASH_ORIGINAL_CONTEXT','Use the original package cohort, native snapshot and source observations.');
  const currency=currencyOf(anchor.profile?.currency??anchor.currency),asOf=dateValue(selection?.asOf,'native cash account date');
  need(snapshot.asOf===asOf&&['customers','accounts','invoices','credits','receipts','allocations'].every(key=>Array.isArray(snapshot[key])),
    'XERO_CASH_NATIVE_SNAPSHOT','Use the complete original native customer snapshot for this account date.',409);
  for(const pack of packages)need((pack.organisation??pack.profile?.organisation)===(anchor.organisation??anchor.profile?.organisation)&&
    sameCurrency(pack.profile?.currency??pack.currency,currency),'XERO_CASH_ORGANISATION','Keep one original organisation and currency in a cycle.',409);
  const normalized=plainSelection(selection,currency),findings=issueCollector(),
    bindings=originalBindings(packages,resolutions,snapshot,currency,findings),
    index=sourceIndex(sources,currency,findings),provider=providerEntries(index,bindings,normalized,currency,findings),
    native=nativeCashRows(snapshot,currency,asOf,findings),
    matched=cashMatches(provider,native,normalized,currency,asOf,findings),
    documents=documentReviews(index,bindings,provider,native,matched,snapshot,currency,asOf,findings);
  auditSourceBalances(index,provider,currency,findings);
  for(const request of provider.bindingRequests)findings.add('CASH_CUSTOMER_BINDING_REQUIRED',
    'Choose the original customer for this prepaid or overpaid source before matching its customer cash.',{kind:request.kind,externalId:request.externalId});
  const sourceFingerprint=digest({schema:XERO_CASH_REVIEW_SCHEMA,rules:XERO_CASH_SOURCE_RULES,
    organisation:anchor.organisation??anchor.profile?.organisation,currency,asOf,
    packages:packages.map(pack=>({id:pack.id,profile:pack.profile,documents:pack.documents,files:pack.files,
      selection:pack.selection,sourceFingerprint:pack.sourceFingerprint,previewSha256:pack.previewSha256})).sort((a,b)=>cmp(a.id,b.id)),
    resolutions:clone(resolutions).sort((a,b)=>cmp(a.packageId+'/'+a.documentId,b.packageId+'/'+b.documentId)),
    snapshot,sources:index.sources,attachmentDescriptors:clone(attachmentDescriptors).sort((a,b)=>cmp(a.name,b.name)),
    baseline:baseline?{cycle:baseline.cycle,reviewSha256:baseline.review.previewSha256,snapshotSha256:digest(baseline.snapshot)}:null});
  const review={schema:XERO_CASH_REVIEW_SCHEMA,label:normalized.label,organisation:anchor.organisation??anchor.profile?.organisation,
    currency,asOf,packageId:anchor.id,packageIds:packages.map(row=>row.id),workspaceId:snapshot.workspaceId,
    revision:snapshot.revision,sourceFingerprint,selection:normalized,rules:XERO_CASH_SOURCE_RULES,
    customers:clone(snapshot.customers),sources:index.summaries,documents,entries:publicValue(provider.entries),
    nativeRows:publicValue(native.rows),receiptLineage:clone(native.lineage),cashSources:clone(provider.cashSources),
    bindingRequests:clone(provider.bindingRequests),representationBridges:publicValue(matched.bridges),findings:findings.result};
  Object.assign(review,cycleChanges(baseline,review,snapshot,currency,asOf));
  const counts={documents:documents.length,entries:review.entries.length,
    matchedEntries:review.entries.filter(row=>row.status==='MATCHED').length,
    unmatchedEntries:review.entries.filter(row=>['UNMATCHED','PARTIALLY_MATCHED'].includes(row.status)).length,
    differences:documents.filter(row=>row.status==='DIFFERENCES').length,
    reviewRequired:documents.filter(row=>row.status==='REVIEW_REQUIRED').length,
    findings:review.findings.length,customerBindings:review.bindingRequests.length,
    nativeRows:review.nativeRows.length,sources:review.sources.length,changes:review.changes.length};
  const allMatched=review.entries.every(row=>['MATCHED','NO_CASH','DELETED','VOIDED'].includes(row.status));
  review.counts=counts;review.status=counts.differences?'DIFFERENCES':
    counts.findings||counts.reviewRequired||!allMatched?'REVIEW_REQUIRED':'MATCHED';
  review.summary=review.status==='MATCHED'?'Original customer balances and exact reviewed cash portions agree for this cycle.':
    review.status==='DIFFERENCES'?'The saved source and native ledger contain exact differences, with the original rows and correction paths retained.':
      'The original observations, customer bindings and remaining matching decisions are retained for the next commissioning pass.';
  review.previewSha256=sha(json(review));
  return {review,files:reportFiles(review)};
}
