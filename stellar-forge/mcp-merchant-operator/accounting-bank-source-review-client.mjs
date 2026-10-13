// SPDX-License-Identifier: MIT
// The same pure recipient-review domain and the original retained source reader.
import {
 REVIEW_SCHEMA,REVIEW_DESK_SCHEMA,REVIEW_LIMITS,reviewBytes,reviewEqual,
 createSourceReview,inspectReviewCapsule,verifySourceReview,readSourceReviewBytes,
 newReviewDraft,saveReviewEdition,previewSourceReviewReturn,decideSourceReviewReturn,
 verifyReviewDecision,newSourceReviewDesk,verifySourceReviewDesk,verifyDecisionReceipt
} from '../../stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/bank-statements/public/source-review-model.mjs';
import {verifyPreparationCapsuleBytes,encodeWholeBase64}
 from '../../stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/bank-statements/public/source-preparation-capsule.mjs';
import {validateBankSourceRequest,canonicalHash} from './accounting-bank-sources-contract.mjs';
export {
 REVIEW_SCHEMA,REVIEW_DESK_SCHEMA,REVIEW_LIMITS,reviewBytes,reviewEqual,
 createSourceReview,inspectReviewCapsule,verifySourceReview,readSourceReviewBytes,
 newReviewDraft,saveReviewEdition,previewSourceReviewReturn,decideSourceReviewReturn,
 verifyReviewDecision,newSourceReviewDesk,verifySourceReviewDesk,verifyDecisionReceipt
};
const need=(yes,message)=>{if(!yes)throw Object.assign(new Error(message),{code:'BANK_SOURCE_REVIEW_BINDING'});};
/** Read all actual receipt members; borrow the original client without closing its workspace. */
export async function captureBankSourceReviewCapsule({client,preparationId,maximumBytes=REVIEW_LIMITS.capsuleBytes,signal}={}){
 need(client&&typeof client.fileBytes==='function','Supply the existing configured Bank source client.');
 need(Number.isSafeInteger(maximumBytes)&&maximumBytes>0&&maximumBytes<=REVIEW_LIMITS.capsuleBytes,'Select a complete review capsule within 32 MiB.');
 const receipt=await client.request({preparationId},{requestSignal:signal});
 need(receipt.state==='COMPLETE','Issue review only from a complete original source preparation.');
 const files=[];let encodedBytes=0;
 for(const pin of receipt.files){
  signal?.throwIfAborted();
  encodedBytes+=Math.ceil(pin.bytes/3)*4;
  need(encodedBytes<=maximumBytes,'The complete preparation does not fit the selected recipient-review capsule. Preserve all files and use its original full receiving path.');
  const file=await client.fileBytes(receipt,pin.name,{maximumBytes:maximumBytes,signal});
  need(file.bytes.length===pin.bytes,'The original complete member length changed.');
  files.push({...pin,encoding:'base64',contentBase64:encodeWholeBase64(file.bytes)});
 }
 const after=await client.request({preparationId},{requestSignal:signal});
 need(canonicalHash(after)===canonicalHash(receipt),'The original complete preparation changed while reading.');
 const value={schema:'stellar-forge.bank-source-capsule.v1',receipt,files};
 const bytes=reviewBytes(value,maximumBytes);
 await verifyPreparationCapsuleBytes(bytes);
 return {bytes,receipt};
}
/** Recompute the whole decision from actual retained issued/current/returned bytes. */
export async function verifyBankSourceReviewForward({issuedBytes,returnedBytes,currentCapsuleBytes,decision}={}){
 need(issuedBytes instanceof Uint8Array&&returnedBytes instanceof Uint8Array&&currentCapsuleBytes instanceof Uint8Array,'Retain all three complete original input files.');
 need(currentCapsuleBytes.length<=REVIEW_LIMITS.capsuleBytes,'The current complete capsule exceeds the 32 MiB review selection.');
 const issued=await readSourceReviewBytes(issuedBytes),returned=await readSourceReviewBytes(returnedBytes);
 await verifyReviewDecision(decision,{issued:issued.value,returned:returned.value,currentCapsuleBytes});
 let request=null;
 if(decision.request){
  request=validateBankSourceRequest(decision.request);
  need(canonicalHash(request)===decision.requestSha256&&reviewEqual(request,decision.request),'The author decision is not the exact maintained collection-edit request.');
 }
 const size=issuedBytes.length+returnedBytes.length+currentCapsuleBytes.length+reviewBytes(decision).length;
 need(size<=REVIEW_LIMITS.workingBytes,'The complete forwarding record exceeds 256 MiB. Keep the original records; nothing can be truncated.');
 return {issued,returned,decision,request,workspaceId:issued.issue.workspaceId,requestSha256:decision.requestSha256,totalInputBytes:size};
}
export function bankSourceReviewSummary(verified){
 const {issue,collection,value}=verified;
 return {schema:REVIEW_SCHEMA+'.summary',issueId:issue.id,workspaceId:issue.workspaceId,
 preparationId:issue.preparationId,author:issue.author,recipient:issue.recipient,purpose:issue.purpose,
 collection:{id:collection.id,revision:collection.revision,name:collection.name,items:collection.items.length},
 editions:value.editions.map(x=>({id:x.id,sequence:x.sequence,sha256:x.sha256,status:x.status,reviewer:x.reviewer,createdAt:x.createdAt,summary:x.summary})),
 originalFile:{...issue.source},sourceSha256:issue.sourceSha256,
 authority:'Named reviewer proposals; a separate original author decision and explicit source-controller execution are required.'};
}
