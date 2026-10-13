// SPDX-License-Identifier: MIT
import type {EventConnectionOptions,EventRecordIdentity,EventMappingComparison} from './native-analysis-events-client.mjs';
export const EVENT_MAPPING_CAPTURE: 'stellar-forge.analysis-event-mapping-capture.v1';
export const EVENT_MAPPING_REVIEW: 'stellar-forge.analysis-event-mapping-review.v1';
export interface EventMappingReceivingOptions extends EventConnectionOptions {
 directory:string;
 expectedWorkspaceId:string;
 programme:string;
 inputId:string;
 comparisonPath?:string;
 draftPath?:string;
 timeoutMs?:number;
 onProgress?:(progress:Record<string,unknown>)=>unknown|Promise<unknown>;
}
export interface EventMappingCaptureReceipt {
 schema:typeof EVENT_MAPPING_CAPTURE;
 state:'PREPARED'|'COMPLETE';
 directory:string;
 analysisWorkspace:string;
 workspace_id:string;
 programme:string;
 input_id:string;
 selection_sha256:string;
 record?:EventRecordIdentity;
 outputs?:Record<string,{bytes:number;sha256:string}>;
 workingFile?:string;
 editableFile?:string;
 offline?:boolean;
}
export interface EventMappingReviewReceivingOptions extends EventMappingReceivingOptions {
 captureDirectory?:string;
 workingPath?:string;
 actionId:string;
 operationId:string;
 resume?:boolean;
 recordSha256?:string;
}
export interface EventMappingReviewReceipt {
 schema:typeof EVENT_MAPPING_REVIEW;
 state:'PREPARED'|'READY'|'RUNNING'|'COMPLETE'|'ERROR'|'INTERRUPTED';
 directory:string;
 analysisWorkspace:string;
 workspace_id:string;
 programme:string;
 input_id:string;
 action_id:string;
 operation_id:string;
 request:Record<string,unknown>;
 /** Exact full returned working file, including colleague source history when supplied. */
 workingFile:string;
 /** Exact original capture used to bind the selected native Review. */
 captureFile:string;
 record?:EventRecordIdentity;
 action?:Record<string,unknown>;
 offline?:boolean;
}
export function prepareNativeAnalysisEventMappingWorking(options:EventMappingReceivingOptions):Promise<EventMappingCaptureReceipt>;
export function downloadNativeAnalysisEventMappingWorking(options:EventMappingReceivingOptions):Promise<EventMappingCaptureReceipt>;
export function reopenNativeAnalysisEventMappingWorking(options:EventMappingReceivingOptions):Promise<EventMappingCaptureReceipt>;
export function prepareNativeAnalysisEventMappingReview(options:EventMappingReviewReceivingOptions):Promise<EventMappingReviewReceipt>;
export function reviewNativeAnalysisEventMappingWorking(options:EventMappingReviewReceivingOptions):Promise<EventMappingReviewReceipt>;
export function receiveNativeAnalysisEventMappingReview(options:EventMappingReviewReceivingOptions):Promise<EventMappingReviewReceipt>;
export function reopenNativeAnalysisEventMappingReview(options:EventMappingReviewReceivingOptions):Promise<EventMappingReviewReceipt>;

export interface EventMappingSavedSourceReceipt {
 schema:'stellar-forge.event-mapping-native-received.v1'; state:'COMPLETE';
 analysisWorkspace:string; workspace_id:string; programme:string; input_id:string;
 action_id:string; operation_id:string; directory:string; source:{id:string;bytes:number;sha256:string};
 actionFile:string; indexFile:string; workingFile:string; editableFile:string;
 files:Array<{name:string;bytes:number;sha256:string;kind:'source'|'html';mime:string}>; offline:true;
}
export function downloadNativeAnalysisEventMappingSavedSource(options:EventMappingReviewReceivingOptions):Promise<EventMappingSavedSourceReceipt>;
export function reopenNativeAnalysisEventMappingSavedSource(options:EventMappingReviewReceivingOptions):Promise<EventMappingSavedSourceReceipt>;
