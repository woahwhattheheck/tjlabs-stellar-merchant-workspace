// SPDX-License-Identifier: MIT
import type {EventConnectionOptions, EventRecordIdentity} from './native-analysis-events-client.mjs';
export interface EventWorkbookReviewSelection {
 directory: string;
 analysisWorkspace: string;
 expectedWorkspaceId: string;
 programme: string;
 actionId: string;
 note?: string;
 reviewSourceId?: string;
}
export interface EventWorkbookReviewPreparation extends EventWorkbookReviewSelection {
 workingPath?: string;
}
export interface EventWorkbookApplyRequest {
 programme: string; id: string; operation_id: string; review_sha256: string; note: string;
 columns_sha256: string; column_review_source: {id: string; bytes: number; sha256: string};
}
export interface EventPreparedWorkbookReview {
 schema: 'stellar-forge.analysis-event-workbook-apply.v1';
 state: string;
 directory: string;
 analysisWorkspace: string;
 workspace_id: string;
 request: EventWorkbookApplyRequest;
 working: Record<string, unknown>;
 columns: Record<string, Array<Record<string, unknown>>>;
 record?: EventRecordIdentity;
 action?: Record<string, unknown>;
}
export interface EventReceivedWorkbookReview {
 schema: 'stellar-forge.analysis-event-workbook-apply.v1';
 state: 'READY' | 'RUNNING' | 'COMPLETE' | 'ERROR' | 'INTERRUPTED';
 directory: string;
 analysisWorkspace: string;
 workspace_id: string;
 action_id: string;
 record: EventRecordIdentity;
 action: Record<string, unknown>;
}
export type EventWorkbookReviewConnection = EventConnectionOptions & EventWorkbookReviewPreparation;
export function prepareNativeAnalysisEventWorkbookReview(options: EventWorkbookReviewPreparation): Promise<EventPreparedWorkbookReview>;
export function applyNativeAnalysisEventWorkbookReview(options: EventWorkbookReviewConnection & {
 resume?: boolean;
 onProgress?: (value: {id: string; received: number; bytes: number}) => unknown | Promise<unknown>;
}): Promise<EventReceivedWorkbookReview>;
export function receiveNativeAnalysisEventWorkbookReview(options: EventConnectionOptions & EventWorkbookReviewSelection): Promise<EventReceivedWorkbookReview>;
export function reopenNativeAnalysisEventWorkbookReview(options: EventWorkbookReviewSelection & {
 recordSha256?: string;
}): Promise<EventPreparedWorkbookReview>;
export const EVENT_WORKBOOK_APPLY_SCHEMA: 'stellar-forge.analysis-event-workbook-apply.v1';
