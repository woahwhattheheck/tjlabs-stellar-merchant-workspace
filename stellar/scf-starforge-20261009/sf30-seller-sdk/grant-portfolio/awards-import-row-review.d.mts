export type JsonObject=Record<string,unknown>;
export type RowDisposition='accepted'|'exception'|'non_application';
export interface AwardCsvRowDecision {
  rowIndex:number; disposition:RowDisposition; reason:string;
  applicationId?:string|null; corrections?:Record<string,string>;
}
export interface AwardCsvRowReviewInput {
  reviewId:string; filename:string; roundId:string; actor:string;
  status?:'draft'|'submitted'; mapping:JsonObject;
  identities:{partners:Record<string,string>;projects?:Record<string,string>;applications?:Record<string,string>};
  csv:Uint8Array; decisions:AwardCsvRowDecision[]; previousReviewSha256?:string;
}
export interface AwardCsvRowReview {
  schema:'stellar-forge.awards-csv-row-review.v1'; reviewId:string;
  source:{sha256:string;bytes:number;filename:string};
  portfolio:{id:string;revision:number;snapshot:string};
  round:{id:string;revision:number;sha256:string};
  actor:string;status:'draft'|'submitted';mapping:JsonObject;
  identities:{partners:Record<string,string>;projects:Record<string,string>;applications:Record<string,string>};
  rows:Array<{rowIndex:number;originalRowSha256:string;disposition:RowDisposition;
    reason:string;applicationId:string|null;corrections:Record<string,string>}>;
  counts:{total:number;accepted:number;exception:number;non_application:number};
  previousReviewSha256?:string;sha256:string;
}
export declare const AWARD_CSV_ROW_REVIEW_SCHEMA:'stellar-forge.awards-csv-row-review.v1';
export declare const AWARD_CSV_ROW_REVIEW_MAX_BYTES:number;
export declare function prepareAwardCsvRowReview(portfolio:JsonObject,input:AwardCsvRowReviewInput):AwardCsvRowReview;
export declare function verifyAwardCsvRowReview(portfolio:JsonObject,review:AwardCsvRowReview,csv:Uint8Array):AwardCsvRowReview;
export declare function materializeAwardCsvRowReview(review:AwardCsvRowReview,csv:Uint8Array):{
  headers:string[];rows:Array<Record<string,string>>;acceptedRowIndexes:number[];applicationIds:Record<string,string>;
};
export declare function encodeAwardCsvRowReview(review:AwardCsvRowReview):Uint8Array;
