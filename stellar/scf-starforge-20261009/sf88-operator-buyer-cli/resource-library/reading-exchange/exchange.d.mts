import type {ContentSearch,SourceBinding,SavedQuery,Query} from '../content-search/engine.mjs';
import type {Annotation} from '../library.mjs';
import type {FileHandle} from 'node:fs/promises';
export interface Choice {resourceId:string;ordinal:number;kind?:'passage'|'excerpt';note?:string}
export interface CaptureRequest {name:string;note?:string;query?:Partial<Query>;savedQueryId?:string;savedQueryRevision?:number;selectionMode?:'passage'|'excerpt';items?:Choice[]}
export interface CapturedQuery {engine:string;q:string;mode:'all'|'any';terms:string[];semantics:{scope:'whole-file';words:string;quotes:'punctuation';combine:'AND'|'OR'};build:string;resourceId:string|null;savedQuery:SavedQuery|null}
export interface CapturedRange {id:string;resourceId:string;sourceSha256:string;ordinal:number;kind:'passage'|'excerpt';byteStart:number;byteEnd:number;lineStart:number;lineEnd:number;sha256:string;note:string}
export interface Capture {schema:string;createdAt:string;name:string;note:string;query:CapturedQuery;source:SourceBinding;coverage:{files:number;bytes:number;counts:Record<string,number>;issues:unknown[];matchingFiles:number};lineConvention:'CRLF_OR_CR_OR_LF';selectionMode:'passage'|'excerpt'|'explicit';resources:Array<{id:string;name:string;bytes:number;sha256:string;contentType?:string|null;url?:string|null;annotation:Annotation}>;items:CapturedRange[]}
export interface Captured {captureSha256:string;capture:Capture}
export interface CaptureSummary {captureSha256:string;name:string;note:string;createdAt:string;query:CapturedQuery;source:SourceBinding;coverage:Capture['coverage'];sourceFiles:number;sourceBytes:number;selectedPassages:number;selectionMode:Capture['selectionMode'];sample:Array<CapturedRange&{name:string}>}
export interface PrepareRequest {captureSha256:string;collectionId:string;expectedRevision:number;operationId:string}
export interface HandoverResult {schema:string;operationId:string;captureSha256:string;name:'reading-handover.zip';bytes:number;sha256:string;collection:{id:string;revision:number;sha256:string;memberCount:number};sourceArchive:{name:'sources.tar';bytes:number;sha256:string;manifestSha256:string};selectedPassages:number;sourceFiles:number;query:CapturedQuery}
export interface HandoverOperation {id:string;request:Omit<PrepareRequest,'operationId'>;state:'PREPARING'|'INTERRUPTED'|'COMPLETE';result:HandoverResult|null;error:string|null}
export interface ExchangeStatus {schema:string;workspaceId:string;captures:CaptureSummary[];operations:HandoverOperation[]}
export interface ReadingExchange {capture(value:CaptureRequest):CaptureSummary;show(sha:string):Captured;status():ExchangeStatus;operation(id:string):HandoverOperation;prepare(value:PrepareRequest,options?:{signal?:AbortSignal}):Promise<HandoverResult>;download(id:string,options?:{signal?:AbortSignal}):Promise<{file:FileHandle;bytes:number;sha256:string;resource:{id:string;name:string};dispose():Promise<void>}>;close():Promise<void>}
export const CAPTURE_SCHEMA:string;
export const HANDOVER_SCHEMA:string;
export function canonical(value:unknown):string;
export function captureReadingSelection(search:ContentSearch,value:CaptureRequest):Captured;
export function openReadingExchange(search:ContentSearch,options?:{python?:string}):Promise<ReadingExchange>;
