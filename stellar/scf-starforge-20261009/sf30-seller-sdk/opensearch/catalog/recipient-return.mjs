// MIT. Explicit recipient adoption in the existing catalogue transaction and Journal.
import {openRecipientReview,compareRecipientReview,selectRecipientAdoption} from '../../../../../products/material-catalog/recipient/review.mjs';
import {digest,canonical,WorkspaceError} from '../workspace/store.mjs';
function currentView(catalog,review){
 const parse=row=>row?JSON.parse(row.record_json):null;
 const selected=catalog.catalog(review.base.catalog.id);
 return {catalog:selected,
  catalogAt:revision=>catalog.history(selected.id).find(x=>x.revision===revision)??null,
  edition:id=>catalog.edition(id),material:(id,key)=>catalog.material(id,key),
  decisions:catalog.db.prepare('SELECT record_json FROM catalog_decisions WHERE catalog_id=? ORDER BY id').all(selected.id).map(parse),
  decisionAt:(id,revision)=>parse(catalog.db.prepare('SELECT record_json FROM catalog_decision_history WHERE decision_id=? AND revision=?').get(id,revision))};
}
export function previewRecipientReview(catalog,reviewText){
 const review=openRecipientReview(reviewText);
 return compareRecipientReview(currentView(catalog,review),review);
}
export function receiveRecipientReview(catalog,request){
 // Called only by OpenSearchCatalogWorkspace.sync, which reserves the original
 // request and commits all decisions plus its COMPLETE result in one transaction.
 const review=openRecipientReview(request.reviewText),comparison=compareRecipientReview(currentView(catalog,review),review);
 if(comparison.sha256!==request.expectedComparisonSha256)throw new WorkspaceError('CATALOG_RECIPIENT_COMPARISON_CHANGED','The original catalogue or customer decision changed. Reopen the return against a fresh author bundle and choose again.',409);
 const validated=selectRecipientAdoption(review,comparison,request);
 if(canonical(validated)!==canonical(request))throw new WorkspaceError('CATALOG_RECIPIENT_REQUEST_CHANGED','Use the complete unmodified reviewed receiving request.',409);
 const choices=new Map(request.choices.map(x=>[x.id,x.choice]));
 const receiptBody={schema:'stellar-forge.material-recipient-adoption.v1',requestId:request.requestId,
  reviewId:review.id,reviewSha256:review.sha256,reviewText:request.reviewText,comparison,
  actor:request.actor,reason:request.reason,choices:request.choices};
 const receipt={...receiptBody,sha256:digest(receiptBody)};
 const results=[];let anchor=null;
 for(const row of comparison.rows){
  if(choices.get(row.id)==='keep'){results.push({context:row.id,choice:'keep',decision:row.current});continue;}
  const p=row.proposal;
  const decisionRequest={catalogId:comparison.catalog.id,expectedCatalogRevision:comparison.catalog.revision,
   customerId:p.customerId,description:p.description,materialKey:p.material.key,expectedMaterialSha256:p.material.sha256,status:p.status,note:p.note};
  if(row.current){decisionRequest.decisionId=row.current.id;decisionRequest.expectedRevision=row.current.revision;}
  const evidence=anchor?{schema:'stellar-forge.material-recipient-adoption-reference.v1',requestId:request.requestId,
   receiptSha256:receipt.sha256,decisionId:anchor.id,revision:anchor.revision}:receipt;
  const result=catalog.writeDecision(decisionRequest,evidence).decision;
  if(!anchor)anchor={id:result.id,revision:result.revision};
  results.push({context:row.id,choice:'adopt',decision:result});
 }
 return {schema:'stellar-forge.material-recipient-received.v1',reviewId:review.id,reviewSha256:review.sha256,
  comparisonSha256:comparison.sha256,receiptSha256:receipt.sha256,anchor,
  // If every choice keeps current, the original complete request/result remains
  // in the existing Journal; no business decision revision is manufactured.
  retainedIn:anchor?'catalogue decision history and original Journal':'original Journal',results};
}
