import type {Library,Annotation} from '../library.mjs';
export type MatchMode='all'|'any';
export interface Query {q:string;mode?:MatchMode;build?:string;resourceId?:string;offset?:number;limit?:number;signal?:AbortSignal}
export interface SourceBinding {schema:string;generation:string;sourceSha256:string;sourceKind:string;source:string}
export interface IndexBuild {id:string;binding:SourceBinding;state:'RUNNING'|'COMPLETE'|'CANCELLED'|'INTERRUPTED'|'FAILED';created:string;updated:string;error:string|null;bytes:number;passages:number;files:number;counts:Record<'TEXT'|'BINARY'|'UNAVAILABLE'|'PENDING'|'INDEXING',number>;completedFiles:number;issues:Array<{resourceId:string;name:string;state:string;error:string}>}
export interface SavedQuery {id:string;name:string;q:string;mode:MatchMode;revision:number;updatedAt:string}
export interface SaveQuery {id?:string;name:string;q:string;mode?:MatchMode;expectedRevision?:number;operationId:string}
export interface DeleteQuery {id:string;expectedRevision:number;operationId:string}
export interface DeletedQuery {deleted:true;id:string;revision:number;updatedAt:string}
export interface Excerpt {text:string;byteStart:number;byteEnd:number;lineStart:number;lineEnd:number;highlights:Array<[number,number]>;truncatedBefore:boolean;truncatedAfter:boolean}
export interface ResearchResource {id:string;name:string;bytes:number;sha256:string;contentType:string|null}
export interface SearchResult {document:string;resource:ResearchResource;annotation:Annotation|null;editable:boolean;passageCount:number;excerpt:Excerpt}
export interface Passage {ordinal:number;byteStart:number;byteEnd:number;lineStart:number;lineEnd:number;excerpt:Excerpt}
export interface Page<T> {build:string;total:number;offset:number;limit:number;nextOffset:number|null;items:T[]}
export interface SearchPage extends Page<SearchResult> {schema:string;binding:SourceBinding;q:string;mode:MatchMode}
export interface FullPassage {build:string;resourceId:string;ordinal:number;passageCount:number;text:string;byteStart:number;byteEnd:number;lineStart:number;lineEnd:number}
export interface Finding extends Passage {resource:ResearchResource;annotation:Annotation|null;editable:boolean}
export interface ResearchStatus {schema:string;current:IndexBuild|null;last:IndexBuild|null;stale:boolean;sourceGeneration:string|null;sourceCoverage:{jobs:number;eligibleFiles:number;rejected:Array<{id:string|null;code:string}>;withoutFile:number};running:boolean;query:{modes:MatchMode[];maximumBytes:number;maximumWords:number;caseSensitive:boolean;accentSensitive:boolean};savedQueries:SavedQuery[]}
export interface ContentSearch {readonly library:Library;readonly path:string;status():ResearchStatus;inspect(id:string):IndexBuild;index(options?:{signal?:AbortSignal;onProgress?:(build:IndexBuild)=>void}):Promise<IndexBuild>;search(options:Query):SearchPage;passages(options:Query&{resourceId:string}):Page<Passage>;page(options:{build?:string;resourceId:string;ordinal:number}):FullPassage;listSaved():SavedQuery[];saveQuery(options:SaveQuery):SavedQuery;deleteQuery(options:DeleteQuery):DeletedQuery;findings(options:Query):Generator<Finding>;cancel():{cancelled:boolean};close():void}
export function queryTerms(q:string):string[];
export function openContentSearch(library:Library):Promise<ContentSearch>;
