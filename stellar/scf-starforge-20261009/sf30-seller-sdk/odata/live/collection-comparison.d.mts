// MIT. Complete retained original comparisons, review history and Analysis transfer.
import type { Buffer } from 'node:buffer';
import type { ODataCollectionFile,ODataCollectionNamedFile } from './collection.mjs';
import type { ODataCollectionComparisonSelection,ODataComparisonCounts,ODataComparisonProjection,ODataComparisonLimits,
  ODataComparisonCell,ODataComparisonEntity,ODataComparisonEntityStatus } from './collection-comparison-engine.mjs';
export type * from './collection-comparison-engine.mjs';
export declare const COMPARISON_SCHEMA:'stellar-forge.odata-live-comparison.v1';
export declare const REVIEW_SCHEMA:'stellar-forge.odata-live-comparison-reviews.v1';
export type ODataComparisonReviewScope='comparison'|'entity'|'column'|'cell';
export interface ODataComparisonReviewRequest {
  requestId:string;expectedRevision:number;scope:ODataComparisonReviewScope;entityKey?:string|null;field?:string|null;
  status:'accepted'|'investigate'|'excluded'|'note';actor:string;note:string;
}
export interface ODataComparisonReviewVersion extends Omit<ODataComparisonReviewRequest,'expectedRevision'|'entityKey'|'field'> {
  entityKey:string|null;field:string|null;requestSha256:string;version:number;savedAt:string;
}
export interface ODataComparisonReviewHistory {
  schema:typeof REVIEW_SCHEMA;comparisonSha256:string;revision:number;history:ODataComparisonReviewVersion[];
}
export interface ODataCollectionComparisonManifest {
  schema:typeof COMPARISON_SCHEMA;engine:'stellar-forge.odata-live-comparison-engine.v1';selectionSha256:string;
  selection:ODataCollectionComparisonSelection;counts:ODataComparisonCounts;analysisProjection:ODataComparisonProjection;
  /** Complete original core, both inputs and exact transformation source files. */
  files:Record<string,ODataCollectionFile>;
}
export interface ODataCollectionComparison extends ODataCollectionComparisonManifest {
  directory:string;status:'COMPLETE';manifestSha256:string;
  reviews:{revision:number;current:ODataComparisonReviewVersion[];history:ODataComparisonReviewVersion[]};
  analysis:ODataCollectionNamedFile & {path:'data/analysis/source.json';reviewRevision:number};
}
export interface ODataCreateCollectionComparison {
  directory:string;beforeDirectory:string;afterDirectory:string;expectedBeforeSha256:string;expectedAfterSha256:string;
  title:string;fields?:string[];limits?:Partial<ODataComparisonLimits>;
}
export interface ODataComparisonRowsOptions {kind?:'cells'|'entities';offset?:number;limit?:number;status?:ODataComparisonEntityStatus}
export interface ODataComparisonRows {
  comparisonSha256:string;selection:ODataCollectionComparisonSelection;kind:'cells'|'entities';offset:number;total:number;
  rows:Array<ODataComparisonCell|ODataComparisonEntity>;nextOffset:number|null;
}
export interface ODataComparisonEdition extends ODataCollectionFile {
  editionId:string;comparisonSha256:string;reviewRevision:number;sourceManifest:string;
}
export interface ODataRestoredComparison extends ODataCollectionComparison {
  restoredFrom:{sha256:string;reviewRevision:number};reused:boolean;
}
export declare function createCollectionComparison(input:ODataCreateCollectionComparison):Promise<ODataCollectionComparison>;
export declare function openCollectionComparison(directory:string,options?:{replay?:boolean}):Promise<ODataCollectionComparison>;
export declare function readComparisonRows(directory:string,options?:ODataComparisonRowsOptions):Promise<ODataComparisonRows>;
export declare function reviewCollectionComparison(directory:string,input:ODataComparisonReviewRequest):Promise<{
  review:ODataComparisonReviewVersion;reviews:ODataComparisonReviewHistory;reused:boolean;
}>;
export declare function publishCollectionComparison(directory:string,input:{expectedRevision:number}):Promise<ODataComparisonEdition>;
export declare function restoreCollectionComparison(input:{directory:string;sourceManifest:string;expectedSha256:string}):Promise<ODataRestoredComparison>;
export declare function comparisonAnalysisMapping(source:string,sourceRevision:number):{
  source:string;source_revision:number;mapping:{collection:'';sse_data:'text';columns:Array<{name:string;pointer:string;type:'text';missing:'error'}>};
};
export declare function comparisonRetainedFiles(directory:string):Promise<{comparison:ODataCollectionComparison;files:ODataCollectionNamedFile[]}>;
export declare function readComparisonFile(directory:string,name:string):Promise<{name:string;relative:string;bytes:Buffer;sha256:string;comparisonSha256:string;selection:ODataCollectionComparisonSelection}>;
export declare function inspectComparisonSource(sourceManifest:string,expectedSha256:string):Promise<ODataCollectionFile & {
  manifest:ODataCollectionComparisonManifest;manifestSha256:string;reviewRevision:number;
}>;
