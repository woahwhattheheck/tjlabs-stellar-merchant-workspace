// MIT. Existing invoice customer reviews through the original owner and private requests.
import {parseReview,draftChanged,MAX_REVIEW_BYTES} from '../../products/x402api-merchant-workspace/customer-review-core.mjs';
import {selectedCustomerReturn,invoiceHash} from './merchant-invoice-connection.mjs';
import {projectNeed as need} from './merchant-project-connection.mjs';
const SHA=/^[a-f0-9]{64}$/,UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const readable=(v,max)=>typeof v==='string'&&v.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v)&&Buffer.from(v).toString('utf8')===v;
const KEYS={issue:['invoiceId','requestId','expectedReviewVersion','invoiceRevision'],
 receive:['invoiceId','requestId','expectedReviewVersion','text'],
 decide:['invoiceId','requestId','expectedReviewVersion','invoiceRevision','comparisonSha256','returnSha256','editionSha256','actor','disposition','note','supportCaseId']};
function sameOwner(value,definition,invoiceId) {
 need(value?.invoiceId===invoiceId&&value.owner?.storeId===definition.identity.storeId&&
  value.owner?.tenantId===definition.identity.tenantId,'MERCHANT_REVIEW_OWNER_CHANGED');
}
async function originalReview(text,definition,invoiceId) {
 need(typeof text==='string'&&Buffer.byteLength(text)<=MAX_REVIEW_BYTES,'MERCHANT_REVIEW_INPUT_CAPACITY');
 const review=await parseReview(text);sameOwner(review.issue,definition,invoiceId);
 need(review.editions.length>0,'MERCHANT_REVIEW_RECORDED_EDITION_REQUIRED');return review;
}
export async function validateMerchantReviewRequest(action,body,definition) {
 const keys=KEYS[action];need(keys&&plain(body)&&Object.keys(body).every(k=>keys.includes(k))&&
  keys.filter(k=>k!=='supportCaseId').every(k=>Object.hasOwn(body,k))&&UUID.test(body.invoiceId??'')&&
  UUID.test(body.requestId??'')&&SHA.test(body.expectedReviewVersion??''),'MERCHANT_REVIEW_REQUEST_INVALID');
 need(Buffer.byteLength(JSON.stringify(body))<=(action==='receive'?96*1024*1024+65536:131072),'MERCHANT_REVIEW_REQUEST_CAPACITY');
 if(action==='issue'||action==='decide')need(SHA.test(body.invoiceRevision??''),'MERCHANT_REVIEW_INVOICE_REVISION_REQUIRED');
 if(action==='decide')need(['comparisonSha256','returnSha256','editionSha256'].every(k=>SHA.test(body[k]??''))&&
  readable(body.actor,240)&&body.actor.trim().length>0&&readable(body.note,16000)&&
  ['accepted','follow_up','declined'].includes(body.disposition)&&
  (body.supportCaseId===undefined||body.supportCaseId===null||UUID.test(body.supportCaseId)),
  'MERCHANT_REVIEW_DISPOSITION_INVALID');
 return action==='receive'?originalReview(body.text,definition,body.invoiceId):null;
}
function reviewSummary(review,text) {
 return {reviewId:review.id,issueId:review.issue.id,issueSha256:review.issue.sha256,
  invoiceId:review.issue.invoiceId,invoiceRevision:review.issue.invoiceRevision,
  returnSha256:invoiceHash(Buffer.from(text)),bytes:Buffer.byteLength(text),
  recordedEditions:review.editions.map(e=>({sequence:e.sequence,sha256:e.sha256,at:e.at,reviewer:e.reviewer,overall:e.draft.overall})),
  originalFiles:review.files.length,unfinishedReturnedDraft:draftChanged(review)};
}
function response(action,value,body,review) {
 need(value?.invoiceId===body.invoiceId&&SHA.test(value.reviewVersion??''),'MERCHANT_REVIEW_RESPONSE_CHANGED');
 if(action==='issue')need(UUID.test(value.issueId??'')&&SHA.test(value.issueSha256??'')&&
  value.invoiceRevision===body.invoiceRevision,'MERCHANT_REVIEW_ISSUE_CHANGED');
 if(action==='receive')need(value.returnSha256===invoiceHash(Buffer.from(body.text))&&
  value.reviewId===review.id&&value.issueId===review.issue.id&&value.editionSha256===review.editions.at(-1).sha256,
  'MERCHANT_REVIEW_RECEIVED_SOURCE_CHANGED');
 if(action==='decide') {
  const d=value.decision;need(plain(d)&&UUID.test(d.id??'')&&d.requestId===body.requestId&&
   ['returnSha256','editionSha256','invoiceRevision','actor','disposition','note'].every(k=>d[k]===body[k])&&
   (d.supportCaseId??null)===(body.supportCaseId??null),'MERCHANT_REVIEW_DECISION_CHANGED');
 }
 return value;
}
function brief(action,value) {
 return {invoiceId:value.invoiceId,reviewVersion:value.reviewVersion,
  ...(action==='issue'?{issueId:value.issueId,issueSha256:value.issueSha256,invoiceRevision:value.invoiceRevision}:{}),
  ...(action==='receive'?{returnSha256:value.returnSha256,reviewId:value.reviewId,issueId:value.issueId,editionSha256:value.editionSha256}:{}),
  ...(action==='decide'?{decisionId:value.decision.id,requestId:value.decision.requestId,
   returnSha256:value.decision.returnSha256,editionSha256:value.decision.editionSha256,disposition:value.decision.disposition}:{} )};
}
export async function executeMerchantReview({kind,args:a,definition:d,files,client}) {
 if(['review_document','review_return','review_support','review_response'].includes(kind))return {artifact:await files.reviewDownload(kind,client,a)};
 if(kind==='review_status') {
  const value=await client.customerReviews(a.invoiceId);sameOwner(value,d,a.invoiceId);
  need(SHA.test(value.reviewVersion??'')&&Array.isArray(value.issues)&&Array.isArray(value.returns)&&Array.isArray(value.decisions),
   'MERCHANT_REVIEW_HISTORY_CHANGED');
  const preview=await client.previewInvoiceDelivery(a.invoiceId);sameOwner(preview,d,a.invoiceId);
  need(SHA.test(preview.revision??''),'MERCHANT_REVIEW_INVOICE_REVISION_REQUIRED');
  return {invoiceId:a.invoiceId,reviewVersion:value.reviewVersion,invoiceRevision:preview.revision,
   issues:value.issues.length,returns:value.returns.length,decisions:value.decisions.length,
   artifact:await files.document('customer-review-history',value,{invoiceId:a.invoiceId},128*1024*1024)};
 }
 if(kind==='review_source') {
  const selected=await selectedCustomerReturn(d,a),review=await originalReview(selected.text,d,a.invoiceId);
  return {...reviewSummary(review,selected.text),artifact:await files.originalBytes('customer-review-source',
   Buffer.from(selected.text),selected.name,'application/json',{invoiceId:a.invoiceId,issueId:review.issue.id})};
 }
 if(kind==='review_compare') {
  const value=await client.compareCustomerReview(a.invoiceId,a.returnSha256);
  need(value.invoiceId===a.invoiceId&&value.returnSha256===a.returnSha256&&SHA.test(value.reviewVersion??'')&&
   SHA.test(value.currentRevision??'')&&SHA.test(value.comparisonSha256??'')&&Array.isArray(value.editions),
   'MERCHANT_REVIEW_COMPARISON_CHANGED');
  return {invoiceId:a.invoiceId,returnSha256:a.returnSha256,reviewVersion:value.reviewVersion,
   invoiceRevision:value.currentRevision,comparisonSha256:value.comparisonSha256,
   invoiceChanged:value.invoiceChanged,unfinishedReturnedDraft:value.unfinishedReturnedDraft,editions:value.editions,
   artifact:await files.document('customer-review-comparison',value,{invoiceId:a.invoiceId,returnSha256:a.returnSha256},128*1024*1024)};
 }
 const action=kind==='review_resume'?a.action:kind.slice('review_'.length);
 need(Object.hasOwn(KEYS,action),'MERCHANT_REVIEW_ACTION_REQUIRED');
 let body,request,review;
 if(kind==='review_resume') {
  const original=await files.originalRequest('review-'+action,a.requestId,a.expectedRequestSha256);
  body=original.body;request=original.artifact;
  need(body.invoiceId===a.invoiceId&&body.requestId===a.requestId,'MERCHANT_REVIEW_ORIGINAL_REQUEST_CHANGED');
  review=await validateMerchantReviewRequest(action,body,d);
 } else {
  const {reviewFile,text,expectedReturnSha256,...selected}=a;body=selected;
  if(action==='receive')body.text=(await selectedCustomerReturn(d,{reviewFile,text,expectedReturnSha256})).text;
  review=await validateMerchantReviewRequest(action,body,d);
  request=await files.request('review-'+action,body.requestId,body);
 }
 const recovery={tool:'merchant_invoice_review_status',invoiceId:body.invoiceId,
  resume:{tool:'merchant_invoice_review_resume',action,invoiceId:body.invoiceId,requestId:body.requestId,
   expectedRequestSha256:request.payload.sha256}};
 let value;
 try {
  value=await client[action==='issue'?'issueCustomerReview':action==='receive'?'receiveCustomerReview':'decideCustomerReview'](body);
  response(action,value,body,review);
 } catch(error) {
  if(error.status===undefined||error.status===null||error.outcome==='UNKNOWN')
   Object.assign(error,{outcome:'UNKNOWN',recovery,requestArtifact:request});
  throw error;
 }
 const received=brief(action,value);
 try{return {...received,requestArtifact:request,
  artifact:await files.document('customer-review-'+action+'-outcome',value,{invoiceId:body.invoiceId,requestId:body.requestId})};}
 catch(error){Object.assign(error,{outcome:'RECEIVED',recovery,requestArtifact:request,received});throw error;}
}
