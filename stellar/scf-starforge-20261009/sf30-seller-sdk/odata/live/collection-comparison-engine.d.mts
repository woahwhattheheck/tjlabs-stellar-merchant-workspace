// MIT. Exact declared-key comparison of original complete live collections.
import type { ODataCollection,ODataCollectionColumn,ODataCollectionFile } from './collection.mjs';
import type { PreparedODataProduct } from '../live-sdk.mjs';
export declare const COMPARISON_ENGINE: 'stellar-forge.odata-live-comparison-engine.v1';
export declare const COMPARISON_COLUMNS: readonly ['entity_key','entity_status','field','change','before_state','after_state','before_type','after_type','before_value','after_value','typed_equal','before_row','after_row'];
export interface ODataComparisonLimits {maxInputBytes: number; maxOutputBytes: number; maxCells: number}
export declare const COMPARISON_LIMITS: Readonly<ODataComparisonLimits>;
export interface ODataComparisonSource extends Pick<ODataCollection,'selectionSha256'|'sourceBinding'|'serviceRoot'|'metadataSha256'|'entitySet'|'merchantOrigin'|'operation'|'rows'|'pageCount'|'query'|'queryFingerprint'|'acquisition'|'reportedCounts'|'countConsistent'> {
  collectionSha256: string; analysisSha256: string;
}
export interface ODataComparisonSelectedField {path: string; before: ODataCollectionColumn | null; after: ODataCollectionColumn | null; declarationChanged: boolean}
export interface ODataCollectionComparisonSelection {
  schema: 'stellar-forge.odata-live-comparison-selection.v1'; engine: typeof COMPARISON_ENGINE; title: string;
  before: ODataComparisonSource; after: ODataComparisonSource; keyFields: string[];
  fields: ODataComparisonSelectedField[]; limits: ODataComparisonLimits;
  presenceMeaning: string; acquisitionMeaning: string; sameQuery: boolean; sameProjection: boolean;
}
export type ODataComparisonEntityStatus='changed'|'unchanged'|'before_only'|'after_only';
export type ODataComparisonChange='presence_changed'|'selection_changed'|'type_changed'|'null_changed'|'declaration_changed'|'spelling_changed'|'value_changed'|'source_changed';
export type ODataComparisonValue={state:'value';type:string;value:string|number|boolean} |
  {state:'null'|'field_not_selected'|'row_absent';type:string|null};
export interface ODataComparisonCell {
  entityKey: string; entityStatus: ODataComparisonEntityStatus; field: string; change: ODataComparisonChange;
  before: ODataComparisonValue; after: ODataComparisonValue; typedEqual: boolean | null;
  beforeRow: number | null; afterRow: number | null;
}
export interface ODataComparisonEntity {
  entityKey: string; status: ODataComparisonEntityStatus;
  beforeRow: number | null; afterRow: number | null; changedFields: string[];
}
export interface ODataComparisonCounts {
  beforeRows: number; afterRows: number; entities: number; matched: number; beforeOnly: number; afterOnly: number;
  changedEntities: number; unchangedEntities: number; changedCells: number;
  changes: Record<ODataComparisonChange,number>;
}
export interface ODataComparisonProjection {format:'csv';columns:number;bytes:number;maxRowBytes:number;maxBytes:134217728;maxRowLimit:2097152}
export interface ODataComparisonDerived {counts:ODataComparisonCounts;analysisProjection:ODataComparisonProjection;outputs:Record<'cells.jsonl'|'changes.csv'|'entities.jsonl',ODataCollectionFile>}
export declare function comparisonLimits(input?: Partial<ODataComparisonLimits>): ODataComparisonLimits;
export declare function selectComparison(before: ODataCollection,after: ODataCollection,input:{title:string;fields?:string[];limits?:Partial<ODataComparisonLimits>}): ODataCollectionComparisonSelection;
export declare function comparisonCsvRow(cell:ODataComparisonCell): Record<(typeof COMPARISON_COLUMNS)[number],string>;
export declare function deriveComparison(input:{
  before:ODataCollection;after:ODataCollection;
  beforeMerchant:Pick<PreparedODataProduct,'plan'|'catalog'>;afterMerchant:Pick<PreparedODataProduct,'plan'|'catalog'>;
  selection:ODataCollectionComparisonSelection;working:string;
  sink?:{write?(name:'cells.jsonl'|'changes.csv'|'entities.jsonl',bytes:Uint8Array):void|Promise<void>};
}):Promise<ODataComparisonDerived>;
