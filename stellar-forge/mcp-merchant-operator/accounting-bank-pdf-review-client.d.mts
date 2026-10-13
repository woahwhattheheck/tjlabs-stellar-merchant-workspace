/** Complete named PDF review ABI. Monetary strings and all original page geometry remain unchanged. */
import type {
 PdfWorkingCopy,PdfRetainedWorkingCopy,PdfAccount,PdfRegion,PdfRow,PdfBalance,
 PdfPageReview,PdfHistory,PdfBankImport,PdfAccountReview,PdfPreparedSource,
 PdfReviewSelection,PdfSourceReference
} from '../../stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/bank-statements/bank-pdf/model.d.ts';
import type {BankStatementSourceInput}
 from '../../stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/bank-statements/source.d.ts';
export type {PdfWorkingCopy,PdfRetainedWorkingCopy,PdfAccount,PdfRegion,PdfRow,PdfBalance,
 PdfPageReview,PdfHistory,PdfBankImport,PdfAccountReview,PdfPreparedSource,PdfReviewSelection,PdfSourceReference,BankStatementSourceInput};
export type Sha256=string;
export type UUID=string;
export type UtcTimestamp=string;
export type Json=null|boolean|number|string|Json[]|{[key:string]:Json};
export const PDF_SCHEMA:'stellar-forge.bank-pdf-working-copy.v1';
export const PDF_LIMITS:Readonly<{fileBytes:16000000;pages:500;items:500000;rows:50000;transferBytes:201326592}>;
export const PDF_REVIEW_SCHEMAS:Readonly<{
 issue:'stellar-forge.bank-pdf-review-issue.v1';
 record:'stellar-forge.bank-pdf-review-record.v1';
 returned:'stellar-forge.bank-pdf-review-return.v1';
 preview:'stellar-forge.bank-pdf-review-preview.v1';
 decision:'stellar-forge.bank-pdf-review-decision.v1';
}>;
export const PDF_REVIEW_LIMITS:Readonly<{transferBytes:402653184;recordBytes:536870912;editions:256;history:20000;textBytes:262144}>;
export interface PdfReviewFilePin {name:string;bytes:number;sha256:Sha256}
export interface PdfReviewSourceBinding {
 workingCopyId:string;revision:number;pdf:PdfReviewFilePin;extractionSha256:Sha256;
}
export interface PdfReviewIssue {
 schema:typeof PDF_REVIEW_SCHEMAS.issue;reviewId:UUID;author:string;recipient:string;purpose:string;
 createdAt:UtcTimestamp;source:PdfReviewSourceBinding;workingCopySha256:Sha256;workingCopy:PdfWorkingCopy;sha256:Sha256;
}
export type PdfReviewInterpretation=Pick<PdfWorkingCopy,'accounts'|'regions'|'rows'|'balances'|'pageReviews'|'history'|'revision'|'bankImports'>;
export interface PdfReviewEdition {
 editionId:UUID;sequence:number;previousSha256:Sha256|null;status:'draft'|'submitted';
 reviewer:string;comment:string;createdAt:UtcTimestamp;interpretation:PdfReviewInterpretation;sha256:Sha256;
}
export interface PdfReviewRecord {
 schema:typeof PDF_REVIEW_SCHEMAS.record;localId:UUID;revision:number;issue:PdfReviewIssue;openedAt:UtcTimestamp;
 draft:{interpretation:PdfReviewInterpretation;reviewer:string;comment:string;raw:string;rawDirty:boolean};
 editions:PdfReviewEdition[];decisions:PdfReviewDecision[];receivingObservations:Json[];
}
export interface PdfReviewReturn {
 schema:typeof PDF_REVIEW_SCHEMAS.returned;reviewId:UUID;issueSha256:Sha256;issue:PdfReviewIssue;
 editionId:UUID;editions:PdfReviewEdition[];sha256:Sha256;
}
export type PdfReviewCollection='accounts'|'regions'|'rows'|'balances'|'pageReviews';
export interface PdfReviewChange {
 key:string;collection:PdfReviewCollection;id:string;field:string|'$item';
 issued:Json;current:Json;returned:Json;conflict:boolean;alreadyCurrent:boolean;
}
export interface PdfReviewAccountFailure {
 accountId:string;ready:false;receivable:false;problems:Array<{code:string;message:string}>;
}
export type PdfReviewAccountResult=PdfAccountReview|PdfReviewAccountFailure;
export interface PdfReviewPreview {
 schema:typeof PDF_REVIEW_SCHEMAS.preview;reviewId:UUID;issueSha256:Sha256;returnSha256:Sha256;
 editionId:UUID;editionSha256:Sha256;current:PdfReviewSourceBinding;currentWorkingCopySha256:Sha256;
 source:PdfReviewSourceBinding;reviewer:string;comment:string;changes:PdfReviewChange[];
 counts:{changes:number;conflicts:number;alreadyCurrent:number};
 currentAccounts:PdfReviewAccountResult[];returnedAccounts:PdfReviewAccountResult[];sha256:Sha256;
}
export interface PdfReviewAppliedOperation {
 collection:PdfReviewCollection;id:string;action:'ACCOUNT'|'REGION'|'ROWS'|'BALANCE'|'PAGE_REVIEW';revision:number;
}
export interface PdfReviewDecision {
 schema:typeof PDF_REVIEW_SCHEMAS.decision;decisionId:UUID;reviewId:UUID;issueSha256:Sha256;returnSha256:Sha256;
 editionId:UUID;currentWorkingCopySha256:Sha256;previewSha256:Sha256;choices:Record<string,'keep'|'adopt'>;
 author:string;/** Maximum 4000 characters, matching the original edit engine. */ reason:string;createdAt:UtcTimestamp;applied:PdfReviewAppliedOperation[];
 resultingWorkingCopySha256:Sha256;resultingRevision:number;resultingHistory:PdfHistory[];
 resultingAccounts:PdfReviewAccountResult[];sha256:Sha256;
}
export interface PdfReviewDecisionResult {decision:PdfReviewDecision;workingCopy:PdfWorkingCopy}
export interface PdfReviewApplicationResult extends PdfReviewDecisionResult {financialReceiving:'SEPARATE_ORIGINAL_BANK_OPERATION'}
export type PdfReviewRowInput=Omit<Partial<PdfRow>,'source'>&{
 accountId:string;source:Pick<PdfSourceReference,'page'|'box'|'itemIds'>
};
export type PdfReviewBalanceInput=Omit<PdfBalance,'source'|'id'>&{
 id?:string;source:Pick<PdfSourceReference,'page'|'box'|'itemIds'>
};
export type PdfReviewEdit=({action:'ACCOUNT';value:PdfAccount}
 |{action:'REGION';value:PdfRegion}
 |{action:'ROWS';value:PdfReviewRowInput[]}
 |{action:'BALANCE';value:PdfReviewBalanceInput}
 |{action:'PAGE_REVIEW';value:PdfPageReview})&{actor:string;reason:string};
export type PdfReviewValue<T>=T|string;
export interface PdfReviewContext {
 issue:PdfReviewValue<PdfReviewIssue>;returned:PdfReviewValue<PdfReviewReturn>;
 currentWorkingCopy:PdfReviewValue<PdfWorkingCopy>;
}
export function canonical(value:unknown):string;
export function digest(value:string|Uint8Array):Promise<Sha256>;
export function openWorkingCopy(text:string):Promise<PdfWorkingCopy>;
export function checkTransferSize(work:PdfWorkingCopy):string;
export function accountReview(work:PdfWorkingCopy|PdfRetainedWorkingCopy,accountId:string):PdfAccountReview;
export function prepareBankSource(work:PdfWorkingCopy,accountId:string,options?:{acknowledgeBalanceDifference?:boolean}):Promise<PdfPreparedSource>;
export function pdfSourceInput(work:PdfWorkingCopy,accountId:string,options?:{acknowledgeBalanceDifference?:boolean}):Promise<BankStatementSourceInput&{format:'PDF_REVIEW';pdfReview:PdfReviewSelection}>;
export function issuePdfReview(input:{
 workingCopy:PdfReviewValue<PdfWorkingCopy>;reviewId:UUID;author:string;recipient:string;purpose:string;createdAt:UtcTimestamp;
}):Promise<PdfReviewIssue>;
export function openPdfReviewIssue(value:PdfReviewValue<PdfReviewIssue>):Promise<PdfReviewIssue>;
export function createPdfReviewRecord(issued:PdfReviewValue<PdfReviewIssue>,identity:{localId:UUID;openedAt:UtcTimestamp}):Promise<PdfReviewRecord>;
export function openPdfReviewRecord(value:PdfReviewValue<PdfReviewRecord>):Promise<PdfReviewRecord>;
export function pdfReviewWorkingCopy(record:PdfReviewValue<PdfReviewRecord>,selection?:{editionId?:UUID}):Promise<PdfWorkingCopy>;
export function editPdfReviewDraft(record:PdfReviewValue<PdfReviewRecord>,edit:PdfReviewEdit):Promise<PdfReviewRecord>;
export function receivePdfWorkingCopy(record:PdfReviewValue<PdfReviewRecord>,workingCopy:PdfReviewValue<PdfWorkingCopy>,review:{reviewer:string;comment:string}):Promise<PdfReviewRecord>;
export function savePdfReviewEdition(record:PdfReviewValue<PdfReviewRecord>,edition:{
 editionId:UUID;status:'draft'|'submitted';reviewer:string;comment:string;createdAt:UtcTimestamp;expectedEditionSha256?:Sha256|null;
}):Promise<PdfReviewRecord>;
export function exportPdfReviewReturn(record:PdfReviewValue<PdfReviewRecord>,selection:{editionId:UUID}):Promise<PdfReviewReturn>;
export function openPdfReviewReturn(value:PdfReviewValue<PdfReviewReturn>,selection?:{issue?:PdfReviewValue<PdfReviewIssue>}):Promise<PdfReviewReturn>;
export function validatePdfReviewCurrent(issue:PdfReviewValue<PdfReviewIssue>,currentWorkingCopy:PdfReviewValue<PdfWorkingCopy>):Promise<PdfWorkingCopy>;
export function previewPdfReviewReturn(context:PdfReviewContext):Promise<PdfReviewPreview>;
export function decidePdfReviewReturn(input:PdfReviewContext&{
 preview:PdfReviewPreview;choices:Record<string,'keep'|'adopt'>;decisionId:UUID;author:string;reason:string;createdAt:UtcTimestamp;
}):Promise<PdfReviewDecisionResult>;
export function applyPdfReviewDecision(input:PdfReviewContext&{decision:PdfReviewDecision}):Promise<PdfReviewApplicationResult>;
export function pdfReviewTransfer(value:unknown,options?:{record?:boolean}):string;
export function bankPdfReviewText(bytes:Uint8Array,maximum?:number):string;
export function bankPdfReviewBytes(value:unknown,options?:{record?:boolean;workingCopy?:boolean}):Uint8Array;
export interface BankPdfReviewSummary {
 kind:'issue'|'record'|'returned'|'working-copy';sha256:Sha256;bytes:number;
 reviewId?:UUID;issueSha256?:Sha256;author?:string;recipient?:string;purpose?:string;
 workingCopy:{id:string;revision:number;pdf:PdfReviewFilePin;extractionSha256:Sha256;
  pages:number;textItems:number;accounts:PdfReviewAccountResult[];interpretationHistory:number;bankImports:PdfBankImport[]};
 editions:Array<Pick<PdfReviewEdition,'editionId'|'sequence'|'status'|'reviewer'|'createdAt'|'sha256'>>;
 localId?:UUID;recordRevision?:number;rawDirty?:boolean;authority:string;
}
export function inspectBankPdfReviewBytes(bytes:Uint8Array):Promise<BankPdfReviewSummary>;
export interface BankPdfReviewApplicationInputs {
 issueBytes:Uint8Array;returnedBytes:Uint8Array;currentWorkingCopyBytes:Uint8Array;decisionBytes:Uint8Array;
}
export interface VerifiedBankPdfReviewApplication extends PdfReviewApplicationResult {
 issue:PdfReviewIssue;returned:PdfReviewReturn;currentWorkingCopy:PdfWorkingCopy;totalInputBytes:number;
}
export function verifyBankPdfReviewApplication(input:BankPdfReviewApplicationInputs):Promise<VerifiedBankPdfReviewApplication>;
/** On-disk schemas emitted by the installed CLI. */
export interface BankPdfReviewApplicationBinding {
 schema:'stellar-forge.bank-pdf-review-application.v1';reviewId:UUID;decisionId:UUID;decisionSha256:Sha256;
 workingCopyId:string;currentWorkingCopySha256:Sha256;resultingWorkingCopySha256:Sha256;
 files:PdfReviewFilePin[];sha256:Sha256;
}
export interface BankPdfReviewApplicationReceipt {
 schema:'stellar-forge.bank-pdf-review-application.v1.result';state:'COMPLETE';bindingSha256:Sha256;
 reviewId:UUID;decisionId:UUID;decisionSha256:Sha256;workingCopyId:string;revision:number;
 resultingWorkingCopySha256:Sha256;files:PdfReviewFilePin[];financialReceiving:'SEPARATE_ORIGINAL_BANK_OPERATION';
}
