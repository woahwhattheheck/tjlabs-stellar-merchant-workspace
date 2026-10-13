// SPDX-License-Identifier: MIT
export interface Currency { code:string; scale:number }
export interface ArchiveSummary {archiveId:string;filename:string;bytes:number;closeId:string;accountId:string;workspaceId:string;name:string;accountName:string;from:string;until:string;currency:Currency;openingBalance:string;closingBalance:string;incoming:string;outgoing:string;difference:string;createdAt:string;actor:string;transactions:number;postings:number;sources:number;customers:number;files:number;manifestSha256:string}
export interface ArchiveIdentity {workspaceId:string;accountId:string;sourceIdentitySha256:string;currency:Currency}
export interface OriginalRecord {id:string;[field:string]:unknown}
export interface SourceFile {name:string;importId:string;format:'OFX'|'QFX'|'CSV'|'CAMT053';bytes:number;sha256:string;originalName:string}
export interface CustomerArchive {id:string;name:string;archiveName:string;bytes:number;sha256:string;files:Map<string,Uint8Array>;account:Record<string,unknown>}
export interface BankClose {archiveId:string;filename:string;bytes:number;raw:Uint8Array;members:Map<string,Uint8Array>;manifest:Record<string,unknown>;manifestSha256:string;report:Record<string,any>;snapshot:Record<string,any>;identity:ArchiveIdentity;postings:OriginalRecord[];sourceFiles:SourceFile[];customers:CustomerArchive[];summary:ArchiveSummary}
export type TargetKind='CLOSE'|'TRANSACTION'|'POSTING'|'SOURCE'|'CUSTOMER';
export type ReviewStatus='OPEN'|'QUESTION'|'EXAMINED'|'RESOLVED';
export interface ReviewTarget {archiveId:string;closeId:string;kind:TargetKind;id:string;label:string;sourceSha256:string}
export interface ReviewEntry {target:ReviewTarget;status:ReviewStatus;note:string}
export interface ReviewEdition {id:string;parentId:string|null;revision:number;actor:string;note:string;entries:ReviewEntry[];createdAt:string;sha256:string}
export interface ReviewArchive {archiveId:string;closeId:string;filename:string;bytes:number;manifestSha256:string}
export interface AccountantReview {schema:'stellar-forge.bank-accountant-review.v1';id:string;name:string;createdAt:string;revision:number;archives:ReviewArchive[];editions:ReviewEdition[];receivedFrom?:{reviewId:string;bundleSha256:string}}
export interface Change {id:string;kind:'ADDED'|'REMOVED'|'CHANGED';before:OriginalRecord|null;after:OriginalRecord|null}
export interface CloseComparison {schema:'stellar-forge.bank-close-comparison.v1';before:ArchiveSummary;after:ArchiveSummary;kind:'SAME_PERIOD_EDITIONS'|'DIFFERENT_PERIODS';totals:Record<string,{before:string;after:string;change:string}>;transactions:Change[];postings:Change[];receipts:Change[];refunds:Change[];allocations:Change[];sources:Change[];reopenings:OriginalRecord[];relatedCloses:OriginalRecord[]}
export const CLOSE_SCHEMA:string;
export const REVIEW_SCHEMA:'stellar-forge.bank-accountant-review.v1';
export const BUNDLE_SCHEMA:'stellar-forge.bank-accountant-review-bundle.v1';
export const MAX_ARCHIVE_BYTES:number;
export const MAX_BUNDLE_BYTES:number;
export const REVIEW_STATUSES:ReviewStatus[];
export function need(ok:unknown,code:string,message:string):asserts ok;
export function plain(value:unknown):value is Record<string,unknown>;
export function copy<T>(value:T):T;
export function json(value:unknown):Uint8Array;
export function bytes(value:Uint8Array|ArrayBuffer):Uint8Array;
export function digest(value:Uint8Array|ArrayBuffer):Promise<string>;
export function parseJson(value:Uint8Array,label?:string):any;
export function readTar(value:Uint8Array|ArrayBuffer,options?:{maximum?:number}):Map<string,Uint8Array>;
export function writeTar(files:Map<string,Uint8Array>|Array<{name:string;bytes:Uint8Array}>,options?:{maximum?:number}):Uint8Array;
export function inspectBankClose(value:Uint8Array|ArrayBuffer,options?:{filename?:string}):Promise<BankClose>;
export function lineage(archive:BankClose,transactionId:string):Record<string,unknown>;
export function compareCloses(before:BankClose,after:BankClose):CloseComparison;
export function reviewTarget(archive:BankClose,kind:TargetKind,id:string):Promise<ReviewTarget>;
export function newReview(input:{id:string;name:string;createdAt:string}):AccountantReview;
export function reviewArchiveSize(review:AccountantReview):number;
export function validateReview(review:AccountantReview,archives:BankClose[]):Promise<AccountantReview>;
export function retainReview(review:AccountantReview,archives:BankClose[],input:{id:string;parentId:string|null;actor:string;note?:string;entries:ReviewEntry[];createdAt:string}):Promise<AccountantReview>;
export function attachArchive(review:AccountantReview,archive:BankClose):AccountantReview;
export function exportReview(review:AccountantReview,archives:BankClose[]):Promise<Uint8Array>;
export function receiveReview(value:Uint8Array|ArrayBuffer):Promise<{review:AccountantReview;archives:BankClose[];sha256:string;bytes:number}>;
