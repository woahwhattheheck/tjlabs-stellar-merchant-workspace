/** Named recipient review proposals; actual preparation uses the unchanged Bank source client. */
import type {AccountingBankSourcesClient,SourceRequest,SourceReceipt,Sha256,UUID,Json} from './accounting-bank-sources-client.mjs';
export type {AccountingBankSourcesClient,SourceRequest,SourceReceipt,Sha256,UUID,Json};
export const REVIEW_SCHEMA:'stellar-forge.bank-source-review.v1';
export const REVIEW_DESK_SCHEMA:'stellar-forge.bank-source-review.v1.desk';
export const REVIEW_LIMITS:Readonly<{capsuleBytes:33554432;packageBytes:67108864;workingBytes:268435456;editions:100;comments:4000;items:1000;mappingBytes:131072}>;
export interface ReviewFilePin {name:string;bytes:number;sha256:Sha256}
export interface ReviewRetainedFile extends ReviewFilePin {encoding:'base64';contentBase64:string}
export interface ReviewMapping {[key:string]:Json;format:string}
export interface ReviewCollectionItem {
 id:UUID;file:ReviewFilePin&{dataBase64:string};mapping:ReviewMapping;included:boolean;note:string;
 preview:Record<string,unknown>|null;
}
export interface ReviewCollection {
 schema:'stellar-forge.bank-source-collection.v1';id:UUID;workspaceId:Sha256;
 name:string;revision:number;items:ReviewCollectionItem[];
 origin?:{collectionId:UUID;workspaceId:string;revision:number};
}
export interface ReviewCapsule {
 value:{schema:'stellar-forge.bank-source-capsule.v1';receipt:SourceReceipt;files:(ReviewRetainedFile&{role:string})[]};
 receipt:SourceReceipt;files:Map<string,ReviewFilePin&{role:string;bytesValue:Uint8Array}>;
 sha256:Sha256;bytes:number;request:SourceRequest;intent:Record<string,unknown>;result:Record<string,unknown>;
}
export interface ReviewIssue {
 schema:'stellar-forge.bank-source-review.v1.issue';id:UUID;createdAt:string;
 author:string;recipient:string;purpose:string;workspaceId:Sha256;preparationId:UUID;
 requestSha256:Sha256;sourceSha256:Sha256;source:ReviewFilePin;
 collection:ReviewFilePin&{id:UUID;revision:number};sha256:Sha256;
}
export interface ReviewProposal {id:UUID;mapping:ReviewMapping;included:boolean;note:string;comment:string}
export interface ReviewEdition {
 schema:'stellar-forge.bank-source-review.v1.edition';id:UUID;sequence:number;
 previousSha256:Sha256|null;issueSha256:Sha256;reviewer:string;createdAt:string;
 status:'draft'|'submitted';summary:string;items:ReviewProposal[];sha256:Sha256;
}
export interface SourceReviewPackage {
 schema:'stellar-forge.bank-source-review.v1.package';issue:ReviewIssue;
 source:ReviewRetainedFile;editions:ReviewEdition[];
}
export interface VerifiedSourceReview {
 value:SourceReviewPackage;issue:ReviewIssue;collection:ReviewCollection;
 capsule:ReviewCapsule;sourceBytes:Uint8Array;
}
export interface ReviewDraft {
 baseEditionSha256:Sha256|null;reviewer:string;summary:string;items:ReviewProposal[];
 rawMapping:null|{itemId:UUID;text:string};
}
export type ReviewField='mapping'|'included'|'note';
export interface ReviewComparisonRow {
 key:string;itemId:UUID;name:string;field:ReviewField;
 baseline:ReviewMapping|boolean|string;current:ReviewMapping|boolean|string|null;
 proposed:ReviewMapping|boolean|string;proposedChanged:boolean;currentChanged:boolean;
 conflict:boolean;canAdopt:boolean;reason:string|null;comment:string;
}
export interface ReviewComparison {
 schema:'stellar-forge.bank-source-review.v1.comparison';issueSha256:Sha256;
 editionSha256:Sha256;currentSource:{
 bytes:number;sha256:Sha256;workspaceId:Sha256;preparationId:UUID;
 requestSha256:Sha256;sourceSha256:Sha256;
 collection:ReviewFilePin&{id:UUID;revision:number}
 };rows:ReviewComparisonRow[];currentAddedIds:UUID[];sha256:Sha256;
}
export interface ReviewComparisonInput {
 issued:SourceReviewPackage;returned:SourceReviewPackage;currentCapsuleBytes:Uint8Array;
 collectionFile?:string;editionSha256:Sha256;
}
export interface ReviewDecisionSelection {
 collectionFile?:string;editionSha256:Sha256;expectedComparisonSha256:Sha256;
 choices:Record<string,'keep'|'adopt'>;actor:string;reason:string;id:UUID;
 requestId:UUID;createdAt:string;
}
export interface ReviewDecision {
 schema:'stellar-forge.bank-source-review.v1.decision';id:UUID;createdAt:string;
 actor:string;reason:string;issueSha256:Sha256;editionSha256:Sha256;
 comparison:ReviewComparison;choices:Record<string,'keep'|'adopt'>;
 state:'EDIT_REQUEST_DRAFT'|'REVIEW_CLOSED_WITHOUT_EDIT';
 request:Extract<SourceRequest,{kind:'collection_edit'}>|null;
 requestSha256:Sha256|null;sha256:Sha256;
}
export interface ReviewDecisionEntry {returnSha256:Sha256;currentSha256:Sha256;decision:ReviewDecision}
export interface ReviewDesk {
 schema:'stellar-forge.bank-source-review.v1.desk';workspaceId:Sha256;origin:string;revision:number;
 draft:ReviewDraft|null;pending:null;operations:never[];selected:null;caseId:UUID;
 package:SourceReviewPackage;returns:ReviewRetainedFile[];currentSources:ReviewRetainedFile[];
 decisions:ReviewDecisionEntry[];activeReturnSha256:Sha256|null;activeCurrentSha256:Sha256|null;
 comparison:ReviewComparison|null;choices:Record<string,'keep'|'adopt'>;author:string;reason:string;
 authorSelection:{editionSha256:string;collectionFile:string};
 authorDraftHistory:unknown[];handoffs:unknown[];
 receiptObservations:{decisionId:UUID;at:string;receipt:SourceReceipt}[];
 receivedWorkingRecords:ReviewRetainedFile[];
 /** Present in the recipient UI after an explicit full working-record import. */
 receivingObservations?:{[key:string]:unknown}[];
}
export function reviewBytes(value:unknown,limit?:number):Uint8Array;
export function reviewEqual(a:unknown,b:unknown):boolean;
export function inspectReviewCapsule(bytes:Uint8Array,file?:string):Promise<{
 collection:ReviewCollection;pin:ReviewFilePin;capsule:ReviewCapsule;
}>;
export function createSourceReview(input:{
 capsuleBytes:Uint8Array;capsuleName:string;collectionFile?:string;author:string;recipient:string;
 purpose:string;id?:UUID;createdAt?:string;
}):Promise<SourceReviewPackage>;
export function verifySourceReview(value:unknown):Promise<VerifiedSourceReview>;
export function readSourceReviewBytes(bytes:Uint8Array):Promise<VerifiedSourceReview>;
export function newReviewDraft(value:VerifiedSourceReview):ReviewDraft;
export function saveReviewEdition(value:SourceReviewPackage,draft:ReviewDraft,options?:{
 status?:'draft'|'submitted';id?:UUID;createdAt?:string;
}):Promise<SourceReviewPackage>;
export function previewSourceReviewReturn(input:ReviewComparisonInput):Promise<ReviewComparison>;
export function decideSourceReviewReturn(input:ReviewComparisonInput&{
 expectedComparisonSha256:Sha256;choices:Record<string,'keep'|'adopt'>;actor:string;reason:string;
 id?:UUID;requestId?:UUID;createdAt?:string;
}):Promise<ReviewDecision>;
export function verifyReviewDecision(decision:ReviewDecision,inputs:{
 issued:SourceReviewPackage;returned:SourceReviewPackage;currentCapsuleBytes:Uint8Array;
}):Promise<ReviewDecision>;
/** Supply origin explicitly outside a browser. */
export function newSourceReviewDesk(value:SourceReviewPackage,options?:{origin?:string}):ReviewDesk;
export function verifySourceReviewDesk(state:unknown):Promise<{
 state:ReviewDesk;verified:VerifiedSourceReview;returns:Map<Sha256,SourceReviewPackage>;sources:Map<Sha256,Uint8Array>;
}>;
export function verifyDecisionReceipt(decision:ReviewDecision,receipt:unknown):Promise<SourceReceipt>;
export function captureBankSourceReviewCapsule(input:{
 client:AccountingBankSourcesClient;preparationId:UUID;maximumBytes?:number;signal?:AbortSignal;
}):Promise<{bytes:Uint8Array;receipt:SourceReceipt}>;
export function verifyBankSourceReviewForward(input:{
 issuedBytes:Uint8Array;returnedBytes:Uint8Array;currentCapsuleBytes:Uint8Array;decision:ReviewDecision;
}):Promise<{issued:VerifiedSourceReview;returned:VerifiedSourceReview;decision:ReviewDecision;
 request:Extract<SourceRequest,{kind:'collection_edit'}>|null;workspaceId:Sha256;requestSha256:Sha256|null;totalInputBytes:number}>;
export interface SourceReviewSummary {
 schema:'stellar-forge.bank-source-review.v1.summary';issueId:UUID;workspaceId:Sha256;
 preparationId:UUID;author:string;recipient:string;purpose:string;
 collection:{id:UUID;revision:number;name:string;items:number};
 editions:Pick<ReviewEdition,'id'|'sequence'|'sha256'|'status'|'reviewer'|'createdAt'|'summary'>[];
 originalFile:ReviewFilePin;sourceSha256:Sha256;authority:string;
}
export function bankSourceReviewSummary(value:VerifiedSourceReview):SourceReviewSummary;
