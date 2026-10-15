/** Complete immutable predecessor provenance. Native session reads verify actual retained results. */
import type {AwardImportSession} from './awards-import-session.mjs';
import type {AwardCsvRowReview} from './awards-import-row-review.mjs';
export interface AwardCsvCompletedApplication {rowIndex:number;originalRowSha256:string;applicationId:string;revision:number;sha256:string}
export interface AwardCsvCompletedOutcome {
 index:number;operationId:string;requestSha256:string;inputSha256:string;
 result:{id:string;revision:number;snapshot:string};applications:AwardCsvCompletedApplication[];
}
export interface AwardCsvContinuation {
 schema:'stellar-forge.awards-csv-completed-continuation.v1';previous:AwardImportSession;
 outcomes:AwardCsvCompletedOutcome[];sha256:string;
}
export interface CarriedAwardCsvRow extends AwardCsvCompletedApplication {
 sessionId:string;sessionSha256:string;operationId:string;requestSha256:string;
 result:{id:string;revision:number;snapshot:string};
}
export const AWARD_CSV_CONTINUATION_SCHEMA:'stellar-forge.awards-csv-completed-continuation.v1';
export function prepareAwardCsvContinuation(previous:AwardImportSession,outcomes:AwardCsvCompletedOutcome[],csv:Uint8Array):AwardCsvContinuation;
export function verifyAwardCsvContinuation(value:AwardCsvContinuation,csv:Uint8Array):AwardCsvContinuation;
export function carriedAwardCsvRows(value:AwardCsvContinuation,review:AwardCsvRowReview,csv:Uint8Array):CarriedAwardCsvRow[];
export function completedAwardCsvRows(value:AwardCsvContinuation,csv:Uint8Array):CarriedAwardCsvRow[];
export function encodeAwardCsvContinuation(value:AwardCsvContinuation):Uint8Array;
