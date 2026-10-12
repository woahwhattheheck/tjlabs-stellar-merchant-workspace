// MIT. Complete comparisons remain bound to the original service and workspace.
import type { ODataCollectionNamedFile } from './collection.mjs';
import type { ODataCollectionSequence,ODataServiceCollectionProfile,ODataServiceCollectionTransferFile } from './collection-store.mjs';
import type { ODataCollectionComparison,ODataCollectionComparisonSelection,ODataComparisonLimits,ODataComparisonRows,
  ODataComparisonRowsOptions,ODataComparisonReviewRequest,ODataComparisonEdition,ODataRestoredComparison,
  reviewCollectionComparison,readComparisonFile } from './collection-comparison.mjs';
export interface ODataServiceComparisonPending {
  id:string;status:'INCOMPLETE';selection:ODataCollectionComparisonSelection|null;beforeSha256:string;afterSha256:string;
  sourceCollections:{before:string|null;after:string|null};
}
export interface ODataServiceComparisonSummary {
  id:string;status:'COMPLETE';title:string;manifestSha256:string;
  before:ODataCollectionComparisonSelection['before'];after:ODataCollectionComparisonSelection['after'];
  sameQuery:boolean;sameProjection:boolean;counts:ODataCollectionComparison['counts'];reviewRevision:number;
}
export interface ODataServiceComparisonInput {
  id:string;beforeCollectionId:string;afterCollectionId:string;expectedBeforeSha256:string;expectedAfterSha256:string;
  title:string;fields?:string[];limits?:Partial<ODataComparisonLimits>;
}
export interface ODataServiceComparison extends ODataCollectionComparison {
  id:string;retainedFiles:ODataCollectionNamedFile[];sourceCollections:{before:string|null;after:string|null};
}
export interface ODataServiceComparisonController {
  list():Promise<Array<ODataServiceComparisonSummary|ODataServiceComparisonPending>>;
  inspect(id:string):Promise<ODataServiceComparison>;
  rows(id:string,options?:ODataComparisonRowsOptions):Promise<ODataComparisonRows>;
  create(input:ODataServiceComparisonInput):Promise<ODataCollectionComparison & {id:string}>;
  review(id:string,input:ODataComparisonReviewRequest):ReturnType<typeof reviewCollectionComparison>;
  publish(id:string,input:{expectedRevision:number}):Promise<ODataComparisonEdition & {sourceRelative:string;files:ODataCollectionNamedFile[]}>;
  restore(input:{id:string;sourceManifest:string;expectedSha256:string}):Promise<ODataRestoredComparison & {id:string}>;
  file(id:string,name:string):ReturnType<typeof readComparisonFile>;
}
export declare function openServiceComparisons(input:{directory:string;profile:ODataServiceCollectionProfile;sequence:ODataCollectionSequence}):Promise<ODataServiceComparisonController>;
export declare function serviceComparisonFiles(input:{directory:string;profile:ODataServiceCollectionProfile}):Promise<{
  comparisons:Array<ODataServiceComparisonSummary|ODataServiceComparisonPending>;files:ODataServiceCollectionTransferFile[];
}>;
export declare function parseComparisonTransferPath(path:string):{serviceId:string;comparisonId:string;file:string}|null;
export declare function validateServiceComparisonTransfer(input:{
  profile:ODataServiceCollectionProfile;files:Array<{path:string;sha256:string;bodyBase64:string;bytes?:number}>;
}):Array<{id:string;status:'INCOMPLETE'}|{id:string;status:'COMPLETE';manifestSha256:string}>;
export declare function verifyServiceComparisons(input:{directory:string;profile:ODataServiceCollectionProfile}):Promise<Array<ODataServiceComparisonSummary|ODataServiceComparisonPending>>;
