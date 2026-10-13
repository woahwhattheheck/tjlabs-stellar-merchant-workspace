// SPDX-License-Identifier: MIT
import type {AccountantReview,BankClose,ReviewTarget} from './core.mjs';
export interface WorkingDraft {target:ReviewTarget;status:string;note:string;actor:string;summary:string;requestId:string;createdAt:string;[key:string]:unknown}
export interface WorkingView {selected:string;tab:'overview'|'transactions'|'sources'|'customers'|'compare'|'review';transaction:string;customer:string;search:string;page:number;compare:string;history:string;pageImport?:string;pageOffset?:number}
export interface SourceEdition {schema:'stellar-forge.bank-accountant-working-source.v1';files:Array<{path:string;content:string;bytes:number;sha256:string}>}
export interface WorkingCopy {schema:'stellar-forge.bank-accountant-working.v1';id:string;createdAt:string;updatedAt:string;review:AccountantReview;drafts:WorkingDraft[];activeDraftId:string|null;view:WorkingView;sourceEditions:string[];runningSourceSha256:string;received:ReceivedWorking[]}
export interface ReceivedWorking {sha256:string;bytes:number;filename:string;receivedAt:string;workingId:string;reviewId:string;snapshot:Omit<WorkingCopy,'received'>;receivedIds:string[]}
export const WORKING_SCHEMA:string;
export const WORKING_BUNDLE_SCHEMA:string;
export const SOURCE_SCHEMA:string;
export const MAX_WORKING_BYTES:number;
export const MAX_DRAFTS:number;
export const VIEW_KEYS:string[];
export const SOURCE_NAMES:string[];
export function defaultView():WorkingView;
export function validateSource(source:SourceEdition):Promise<SourceEdition>;
export function sourceEdition(files:Record<string,string>):Promise<SourceEdition>;
export function validateWorking(working:WorkingCopy,archives:BankClose[],sources:SourceEdition[]):Promise<WorkingCopy>;
export function makeWorking(input:{id:string;createdAt:string;updatedAt:string;review:AccountantReview;archives:BankClose[];drafts?:WorkingDraft[];activeDraftId?:string|null;view?:WorkingView;sources:SourceEdition[];runningSourceSha256:string;received?:ReceivedWorking[]}):Promise<WorkingCopy>;
export function exportWorking(working:WorkingCopy,archives:BankClose[],sources:SourceEdition[]):Promise<Uint8Array>;
export function receiveWorking(input:Uint8Array|ArrayBuffer):Promise<{working:WorkingCopy;archives:BankClose[];sources:SourceEdition[];sha256:string;bytes:number}>;
export function mergeDrafts(drafts:WorkingDraft[],active:WorkingDraft|null):WorkingDraft[];
export function workingArchiveSize(working:WorkingCopy,archives:BankClose[],sources:SourceEdition[]):number;
export function retainIncoming(value:Awaited<ReturnType<typeof receiveWorking>>,options:{filename:string;receivedAt:string}):Promise<ReceivedWorking[]>;
export function exportIncoming(working:WorkingCopy,archives:BankClose[],sources:SourceEdition[],sha256:string):Promise<{raw:Uint8Array;filename:string}>;
export function workingSummary(value:Awaited<ReturnType<typeof receiveWorking>>):Record<string,unknown>;
