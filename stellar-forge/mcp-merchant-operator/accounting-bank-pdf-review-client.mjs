// SPDX-License-Identifier: MIT
// Named PDF proposals continue the original PDF working copy, never a financial writer.
import {
 PDF_REVIEW_SCHEMAS,PDF_REVIEW_LIMITS,issuePdfReview,openPdfReviewIssue,
 createPdfReviewRecord,openPdfReviewRecord,pdfReviewWorkingCopy,editPdfReviewDraft,
 receivePdfWorkingCopy,savePdfReviewEdition,exportPdfReviewReturn,openPdfReviewReturn,
 previewPdfReviewReturn,decidePdfReviewReturn,applyPdfReviewDecision,validatePdfReviewCurrent,pdfReviewTransfer
} from '../../stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/bank-statements/bank-pdf/review-model.mjs';
import {
 PDF_SCHEMA,PDF_LIMITS,canonical,digest,openWorkingCopy,accountReview,
 pdfSourceInput,prepareBankSource,checkTransferSize
} from '../../stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/bank-statements/bank-pdf/model.mjs';
export {
 PDF_REVIEW_SCHEMAS,PDF_REVIEW_LIMITS,issuePdfReview,openPdfReviewIssue,
 createPdfReviewRecord,openPdfReviewRecord,pdfReviewWorkingCopy,editPdfReviewDraft,
 receivePdfWorkingCopy,savePdfReviewEdition,exportPdfReviewReturn,openPdfReviewReturn,
 previewPdfReviewReturn,decidePdfReviewReturn,applyPdfReviewDecision,validatePdfReviewCurrent,pdfReviewTransfer,
 PDF_SCHEMA,PDF_LIMITS,canonical,digest,openWorkingCopy,accountReview,
 pdfSourceInput,prepareBankSource,checkTransferSize
};
const need=(ok,message)=>{if(!ok)throw Object.assign(new Error(message),{code:'BANK_PDF_REVIEW_BINDING'});};
export function bankPdfReviewText(bytes,maximum=PDF_REVIEW_LIMITS.transferBytes){
 need(bytes instanceof Uint8Array&&bytes.byteLength>0&&bytes.byteLength<=maximum,'Keep the complete selected UTF-8 file within its original limit.');
 return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}
export function bankPdfReviewBytes(value,{record=false,workingCopy=false}={}){
 const text=workingCopy?checkTransferSize(value):pdfReviewTransfer(value,{record});
 return new TextEncoder().encode(text);
}
/** The installed client uses the actual domain validator for each complete source. */
export async function inspectBankPdfReviewBytes(bytes){
 const text=bankPdfReviewText(bytes,PDF_REVIEW_LIMITS.recordBytes),value=JSON.parse(text);
 let selected,kind,work,issue,editions=[];
 if(value.schema===PDF_REVIEW_SCHEMAS.issue){kind='issue';selected=issue=await openPdfReviewIssue(text);work=issue.workingCopy;}
 else if(value.schema===PDF_REVIEW_SCHEMAS.record){kind='record';selected=await openPdfReviewRecord(text);issue=selected.issue;editions=selected.editions;work=await pdfReviewWorkingCopy(selected);}
 else if(value.schema===PDF_REVIEW_SCHEMAS.returned){kind='returned';selected=await openPdfReviewReturn(text);issue=selected.issue;editions=selected.editions;work={...issue.workingCopy,...editions.at(-1).interpretation};}
 else if(value.schema===PDF_SCHEMA){kind='working-copy';selected=work=await openWorkingCopy(text);}
 else need(false,'Select a whole issue, recipient working record, submitted return or original PDF working copy; decisions require their complete retained context.');
 return {kind,sha256:await digest(bytes),bytes:bytes.length,
  ...(issue?{reviewId:issue.reviewId,issueSha256:issue.sha256,author:issue.author,recipient:issue.recipient,purpose:issue.purpose}:{}),
  workingCopy:{id:work.id,revision:work.revision,pdf:{name:work.file.name,bytes:work.file.bytes,sha256:work.file.sha256},
   extractionSha256:work.extractionSha256,pages:work.extraction.pages.length,textItems:work.extraction.pages.reduce((n,p)=>n+p.items.length,0),
   accounts:work.accounts.map(a=>{try{return accountReview(work,a.id);}catch(e){return {accountId:a.id,ready:false,receivable:false,problems:[{code:e.code??'PDF_REVIEW',message:e.message}]};}}),interpretationHistory:work.history.length,bankImports:work.bankImports},
  editions:editions.map(e=>({editionId:e.editionId,sequence:e.sequence,status:e.status,reviewer:e.reviewer,createdAt:e.createdAt,sha256:e.sha256})),
  ...(kind==='record'?{localId:selected.localId,recordRevision:selected.revision,rawDirty:selected.draft.rawDirty}:{}),
  authority:'Named interpretation proposals; only a separate explicit original Bank operation receives financial data.'};
}
/** Recompute the complete decision against exact issued/current/returned inputs. */
export async function verifyBankPdfReviewApplication({issueBytes,returnedBytes,currentWorkingCopyBytes,decisionBytes}={}){
 const issue=await openPdfReviewIssue(bankPdfReviewText(issueBytes));
 const returned=await openPdfReviewReturn(bankPdfReviewText(returnedBytes),{issue});
 const currentWorkingCopy=await openWorkingCopy(bankPdfReviewText(currentWorkingCopyBytes,PDF_LIMITS.transferBytes));
 const decision=JSON.parse(bankPdfReviewText(decisionBytes));
 const result=await applyPdfReviewDecision({issue,returned,currentWorkingCopy,decision});
 need(result.workingCopy.id===currentWorkingCopy.id&&result.workingCopy.file.sha256===currentWorkingCopy.file.sha256&&result.workingCopy.extractionSha256===currentWorkingCopy.extractionSha256,'The original PDF working-copy or extraction identity changed.');
 return {issue,returned,currentWorkingCopy,decision,workingCopy:result.workingCopy,
  financialReceiving:result.financialReceiving,
  totalInputBytes:issueBytes.length+returnedBytes.length+currentWorkingCopyBytes.length+decisionBytes.length};
}
