// SPDX-License-Identifier: MIT
import type {BankStatementSourceInput} from '../source.mjs';
export type PdfBox=[number,number,number,number];
export interface PdfTextItem {
 id:string;index:number;text:string;transform:number[];width:number;height:number;fontName:string;dir:string;hasEOL:boolean;box:PdfBox;
 quad?:number[];[key:string]:unknown;
}
export interface PdfPage {number:number;width:number;height:number;view:number[];rotation:number;viewportTransform:number[];items:PdfTextItem[];styles:Record<string,unknown>;lang:string|null;[key:string]:unknown}
export interface PdfExtraction {schema:'stellar-forge.bank-pdf-extraction.v1';engine:{name:'PDF.js';version:string;options?:Record<string,unknown>;[key:string]:unknown};pages:PdfPage[];[key:string]:unknown}
export interface PdfSourceReference {page:number;box:PdfBox;itemIds:string[];text:string;pdfSha256:string;extractionSha256:string}
export interface PdfAccount {id:string;name:string;bankId:string;branchId:string;accountId:string;accountType:string;currency:string;scale:number;from:string;until:string;note:string}
export type PdfYearRule={year:number}|{century:number}|null;
export interface PdfRegion {id:string;accountId:string;page:number;box:PdfBox;columns:Partial<Record<'date'|'debit'|'credit'|'amount'|'description'|'reference'|'balance',[number,number]>>;dateFormat:'YMD'|'DMY'|'MDY';yearRule:PdfYearRule;amountMode:'SIGNED'|'DEBIT_CREDIT';amountPrefix:string;amountSuffix:string;decimalSeparator:'.'|',';groupSeparator:string;lineTolerance:number;descriptionContinuation:boolean;negativeMeans:'DEBIT'|'CREDIT'}
export interface PdfRow {id:string;accountId:string;regionId:string|null;source:PdfSourceReference;raw:Record<string,string>;decision:'REVIEW'|'INCLUDE'|'EXCLUDE';postedDate:string;amount:string;payee:string;memo:string;reference:string;runningBalance:string;note:string}
export interface PdfBalance {id:string;accountId:string;kind:'OPENING'|'CLOSING'|'RUNNING'|'OTHER';date:string;amount:string;source:PdfSourceReference;raw:string;selected:boolean;note:string}
export interface PdfPageReview {page:number;disposition:'CASH_MAPPED'|'OTHER_ACCOUNT'|'INFORMATION'|'MANUAL_REVIEW'|'MANUAL_MAPPED';note:string}
export interface PdfHistory {revision:number;action:'ACCOUNT'|'REGION'|'ROWS'|'BALANCE'|'PAGE_REVIEW'|'BANK_IMPORT';actor:string;reason:string;at:string;before:unknown;after:unknown}
export interface PdfBankImport {workspaceId:string;importId:string;requestId:string;bankAccountId:string;workingRevision:number;accountId:string;csvSha256:string;mappingSha256:string;pdfSha256:string;reviewSha256:string}
export interface PdfWorkingCopy {schema:'stellar-forge.bank-pdf-working-copy.v1';id:string;revision:number;name:string;createdAt:string;file:{name:string;type:'application/pdf';bytes:number;sha256:string;dataBase64:string};extraction:PdfExtraction;extractionSha256:string;accounts:PdfAccount[];regions:PdfRegion[];rows:PdfRow[];balances:PdfBalance[];pageReviews:PdfPageReview[];history:PdfHistory[];bankImports:PdfBankImport[]}
export type PdfRetainedWorkingCopy=Omit<PdfWorkingCopy,'file'>&{file:Omit<PdfWorkingCopy['file'],'dataBase64'>};
export interface PdfProblem {code:string;message:string;rowId?:string;rowIds?:string[];pages?:number[];itemId?:string;difference?:string}
export interface PdfAccountReview {account:PdfAccount;included:number;excluded:number;unreviewed:number;movement:string;opening:PdfBalance|null;closing:PdfBalance|null;calculatedClosing:string|null;difference:string|null;problems:PdfProblem[];ready:boolean;receivable:boolean}
export interface PdfPreparedSource {schema:'stellar-forge.bank-pdf-prepared-source.v1';workingCopyId:string;workingRevision:number;pdf:PdfRetainedWorkingCopy['file'];extractionSha256:string;accountId:string;source:BankStatementSourceInput;csvSha256:string|null;mappingSha256?:string;review:PdfAccountReview;rowMap:Array<{recordNumber:number;rowId?:string;balanceId?:string;source:PdfSourceReference}>;mapping:{account:PdfAccount;regions:PdfRegion[];rows:PdfRow[];balances:PdfBalance[];pageReviews:PdfPageReview[]}}
export interface PdfReviewSelection {workingCopy:PdfRetainedWorkingCopy;accountId:string;acknowledgeBalanceDifference:boolean;csvSha256:string;mappingSha256:string}
export interface PdfRetainedReview {schema:'stellar-forge.bank-pdf-retained-review.v1';accountId:string;workingCopy:PdfRetainedWorkingCopy;csv:{file:BankStatementSourceInput['file'];sha256:string;configuration:BankStatementSourceInput['csv']};rowMap:PdfPreparedSource['rowMap'];review:PdfAccountReview;mappingSha256:string;acknowledgeBalanceDifference:boolean}
export declare const PDF_SCHEMA:'stellar-forge.bank-pdf-working-copy.v1';
export declare const PDF_EXTRACTION_SCHEMA:'stellar-forge.bank-pdf-extraction.v1';
export declare const PDF_LIMITS:Readonly<{fileBytes:number;pages:number;items:number;rows:number;transferBytes:number}>;
export declare function canonical(value:unknown):string;
export declare function digest(value:string|Uint8Array):Promise<string>;
export declare function encodeBase64(bytes:Uint8Array):string;
export declare function decodeBase64(value:string):Uint8Array;
export declare function dateValue(value:unknown,format?:'YMD'|'DMY'|'MDY',yearRule?:PdfYearRule):string;
export declare function amountValue(value:unknown,options?:{decimalSeparator?:'.'|',';groupSeparator?:string;scale?:number;parenthesesNegative?:boolean;prefix?:string;suffix?:string}):string;
export declare function toMinor(value:string,scale:number):bigint;
export declare function fromMinor(value:bigint,scale:number):string;
export declare function boxValue(value:PdfBox,page:PdfPage):PdfBox;
export declare function pageByNumber(work:PdfWorkingCopy|PdfRetainedWorkingCopy,page:number):PdfPage;
export declare function sourceText(work:PdfWorkingCopy|PdfRetainedWorkingCopy,source:Pick<PdfSourceReference,'page'|'itemIds'>):string;
export declare function createWorkingCopy(value:{name?:string;file:{name:string;dataBase64:string;sha256?:string};extraction:PdfExtraction}):Promise<PdfWorkingCopy>;
export declare function validateExtraction(value:PdfExtraction):void;
export declare function editWorkingCopy(work:PdfWorkingCopy,action:PdfHistory['action'],value:unknown,review:{actor:string;reason:string}):PdfWorkingCopy;
export declare function candidateRows(work:PdfWorkingCopy,region:PdfRegion):Array<Omit<PdfRow,'source'>&{source:Pick<PdfSourceReference,'page'|'box'|'itemIds'>}>;
export declare function accountReview(work:PdfWorkingCopy|PdfRetainedWorkingCopy,accountId:string):PdfAccountReview;
export declare function bankSourceDraft(work:PdfWorkingCopy|PdfRetainedWorkingCopy,accountId:string,options?:{acknowledgeBalanceDifference?:boolean}):PdfPreparedSource;
export declare function checkTransferSize(work:PdfWorkingCopy):string;
export declare function openWorkingCopy(text:string):Promise<PdfWorkingCopy>;
export declare function prepareBankSource(work:PdfWorkingCopy,accountId:string,options?:{acknowledgeBalanceDifference?:boolean}):Promise<PdfPreparedSource>;
export declare function pdfSourceInput(work:PdfWorkingCopy,accountId:string,options?:{acknowledgeBalanceDifference?:boolean}):Promise<BankStatementSourceInput&{format:'PDF_REVIEW';pdfReview:PdfReviewSelection}>;
