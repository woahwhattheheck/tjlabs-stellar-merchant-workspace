// MIT. Exact native customer-account preview seals and mutation preparation.
import {createHash} from 'node:crypto';
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const HASH=/^[a-f0-9]{64}$/;
const json=value=>JSON.stringify(value,null,2)+'\n';
const digest=value=>createHash('sha256').update(json(value)).digest('hex');
const rawDigest=value=>createHash('sha256').update(value,'utf8').digest('hex');
const need=(ok,message)=>{if(!ok)throw Object.assign(new Error(message),{code:'ACCOUNTING_CUSTOMER_ACCOUNT_PREVIEW'});};
function common(preview,schema){
  need(plain(preview)&&preview.schema===schema&&HASH.test(preview.workspaceId??'')&&
    Number.isSafeInteger(preview.revision)&&preview.revision>=1&&HASH.test(preview.reviewSha256??''),
    'Retain the complete original customer account preview and current workspace identity.');
}
function identity(value){
  need(plain(value)&&typeof value.actor==='string'&&value.actor.trim().length>0&&value.actor.trim().length<=1000&&
    typeof value.requestId==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value.requestId),
    'Supply the original responsible operator and stable request identifier.');
  return{actor:value.actor,requestId:value.requestId};
}
export function accountingCustomerPublicationPreview(preview){
  common(preview,'stellar-forge.merchant-customer-account-publication.v1');
  const {sourceSha256,reviewSha256,...selection}=preview;
  need(UUID.test(preview.publicationId??'')&&UUID.test(preview.customerId??'')&&
    preview.account?.customer?.id===preview.customerId&&preview.account?.asOf===preview.asOf&&
    Array.isArray(preview.account.invoices)&&Array.isArray(preview.invoiceSources)&&plain(preview.files)&&
    HASH.test(preview.accountSha256??'')&&digest(preview.account)===preview.accountSha256&&
    preview.files['account.json']?.sha256===preview.accountSha256&&
    preview.files['account.json']?.bytes===Buffer.byteLength(json(preview.account),'utf8')&&
    digest(selection)===reviewSha256&&digest({accountSha256:preview.accountSha256,files:preview.files,invoiceSources:preview.invoiceSources})===sourceSha256,
    'The complete dated customer account or original publication source differs from its reviewed seal.');
  return preview;
}
export function accountingCustomerPublicationArguments(preview,value){
  accountingCustomerPublicationPreview(preview);
  return{publicationId:preview.publicationId,customerId:preview.customerId,asOf:preview.asOf,...identity(value),
    workspaceId:preview.workspaceId,revision:preview.revision,reviewSha256:preview.reviewSha256};
}
export function accountingCustomerResponsePreview(preview){
  common(preview,'stellar-forge.merchant-customer-account-response.v1');
  const {source,reviewSha256,...review}=preview;
  need(plain(source)&&typeof source.responseText==='string'&&Buffer.byteLength(source.responseText,'utf8')<=1500000&&
    UUID.test(source.publicationId??'')&&source.publicationId===preview.publication?.id&&
    preview.response?.account?.publicationId===source.publicationId&&
    preview.response.account.workspaceId===preview.workspaceId&&preview.response.account.customerId===preview.publication.customerId&&
    preview.response.account.sourceSha256===preview.publication.sourceSha256&&
    preview.response.account.accountSha256===preview.publication.accountSha256&&
    rawDigest(source.responseText)===preview.sourceSha256&&digest(review)===reviewSha256,
    'Keep the exact original response text, publication identity and complete native intake review.');
  return preview;
}
export function accountingCustomerResponseArguments(preview,value){
  accountingCustomerResponsePreview(preview);
  return{publicationId:preview.source.publicationId,responseText:preview.source.responseText,...identity(value),
    workspaceId:preview.workspaceId,revision:preview.revision,reviewSha256:preview.reviewSha256};
}
export function accountingCustomerResponseReviewPreview(preview){
  common(preview,'stellar-forge.merchant-customer-account-response-review.v1');
  const {reviewSha256,...review}=preview;
  need(UUID.test(preview.responseId??'')&&UUID.test(preview.entry?.id??'')&&
    preview.originalInvoice?.id===preview.entry.invoiceId&&preview.currentInvoice?.id===preview.entry.invoiceId&&
    preview.choice?.entryId===preview.entry.id&&preview.choice.expectedVersion===preview.responseVersion&&
    Number.isSafeInteger(preview.responseVersion)&&preview.responseVersion>=1&&
    Array.isArray(preview.operations)&&Array.isArray(preview.changedFields)&&digest(review)===reviewSha256,
    'Keep the complete original entry, selected current invoice/case and reviewed operator choices.');
  return preview;
}
export function accountingCustomerResponseReviewArguments(preview,value){
  accountingCustomerResponseReviewPreview(preview);
  return{...structuredClone(preview.choice),...identity(value),workspaceId:preview.workspaceId,
    revision:preview.revision,reviewSha256:preview.reviewSha256,customerResponseId:preview.responseId};
}
