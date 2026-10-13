// SPDX-License-Identifier: MIT
export interface EventNativeClient {
 endpoint: string;
 analysisWorkspace: string;
 call(operation: string, request?: Record<string, unknown>, options?: {signal?: AbortSignal; requestSignal?: AbortSignal | null; timeoutMs?: number}): Promise<Record<string, unknown>>;
}
export interface EventConnectionOptions {
 url?: string;
 analysisWorkspace: string;
 tokenEnv?: string;
 environment?: Record<string, string | undefined>;
 signal?: AbortSignal;
 client?: EventNativeClient;
}
export interface EventFileIdentity {name: string; bytes: number; sha256: string;}
export interface EventInputOptions extends EventConnectionOptions {
 directory: string;
 expectedWorkspaceId: string;
 inputId: string;
 ndjsonPath?: string;
 manifestPath?: string;
 ndjsonName?: string;
 manifestName?: string;
 onProgress?: (progress: {inputId: string; kind: 'ndjson' | 'manifest'; received: number; bytes: number}) => unknown | Promise<unknown>;
}
export interface EventInputReceipt {
 schema: 'stellar-forge.analysis-event-input-receiving.v1';
 state: 'COMPLETE';
 analysisWorkspace: string;
 workspaceId: string;
 inputId: string;
 files: {ndjson: EventFileIdentity; manifest: EventFileIdentity};
 directory: string;
}
export interface EventRecordIdentity {
 schema: 'stellar-forge.analysis-event-record.v1';
 workspace_id: string;
 kind: 'overview' | 'programme' | 'action';
 record_id: string;
 bytes: number;
 sha256: string;
}
export function openNativeAnalysisEventsClient(options: Omit<EventConnectionOptions, 'client'>): Promise<EventNativeClient>;
export function nativeEventConnection(options: EventConnectionOptions): Promise<EventNativeClient>;
export function receiveNativeAnalysisEventInput(options: EventInputOptions): Promise<EventInputReceipt>;
export function readNativeAnalysisEventRecord(options: EventConnectionOptions & {record: EventRecordIdentity}):
 Promise<{record: EventRecordIdentity; bytes: Uint8Array; text: string}>;
