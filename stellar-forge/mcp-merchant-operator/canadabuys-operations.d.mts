import type { CanadaBuysMerchantClient, SelectedTool, ToolArguments, ShortTool, FullToolName } from './canadabuys-client.mjs';
export interface CustomerConnection {
 schema: 'stellar-forge.canadabuys-customer-connection.v1'; url: string; tokenEnv: string; workspace: string;
 workspaceId: string | null; maximumResponseBytes: number;
}
export interface OperationRequest {
 schema: 'stellar-forge.canadabuys-customer-operation.v1'; operationId: string; connection: CustomerConnection;
 request: { name: FullToolName; arguments: Record<string, unknown> };
 replay: { replayable: boolean; basis: string; commandId?: string; captureId?: string; inputSha256?: string };
}
export interface FileIdentity { bytes: number; sha256: string }
export interface OperationCompletion {
 schema: string; operationId: string; requestSha256: string; outcome: 'RETURNED' | 'ADOPTED_ORIGINAL_PUBLICATION';
 completedAt: string; result: FileIdentity & { path: string };
}
export interface OperationResult extends OperationCompletion {
 state: 'COMPLETE'; value: Record<string, unknown>; reused?: boolean; networkRequests?: 0;
}
export interface OperationObservation {
 schema: string; directory: string; request: OperationRequest; requestSha256: string; state: string;
 progress: Record<string, unknown> | null; completion?: OperationCompletion; value?: Record<string, unknown>;
 networkRequests: 0; mutation: false;
}
export interface RunOptions {
 directory: string; client?: CanadaBuysMerchantClient; environment?: Record<string, string | undefined>;
 signal?: AbortSignal; timeoutMs?: number;
}
export declare const CANADABUYS_CUSTOMER_CONNECTION_SCHEMA: 'stellar-forge.canadabuys-customer-connection.v1';
export declare const CANADABUYS_CUSTOMER_OPERATION_SCHEMA: 'stellar-forge.canadabuys-customer-operation.v1';
export declare function canadaBuysOperationBytes(value: unknown): Uint8Array;
export declare function canadaBuysCustomerConnectionTemplate(): CustomerConnection;
export declare function normalizeCanadaBuysCustomerConnection(value: unknown, options?: { requireWorkspaceId?: boolean }): CustomerConnection;
export declare function readCanadaBuysCustomerJson(path: string, maximum?: number): Promise<{ value: unknown; bytes: Uint8Array; identity: FileIdentity }>;
export declare function prepareCanadaBuysOperation<N extends SelectedTool>(options: {
 directory: string; operationId: string; connection: CustomerConnection; tool: N; arguments?: ToolArguments[ShortTool<N>];
}): Promise<{ schema: string; operationId: string; directory: string; requestSha256: string; reused: boolean;
 request: OperationRequest; networkRequests: 0; mutation: false }>;
export declare function showCanadaBuysOperation(directory: string): Promise<OperationObservation>;
export declare function executeCanadaBuysOperation(options: RunOptions): Promise<OperationResult>;
export declare function adoptCanadaBuysPublication(options: Omit<RunOptions, 'timeoutMs'> & { publicationId: string; note: string }): Promise<OperationResult>;
export declare function bindCanadaBuysCustomerConnection(options: {
 connection: CustomerConnection; client?: CanadaBuysMerchantClient; environment?: Record<string, string | undefined>; signal?: AbortSignal;
}): Promise<{ connection: CustomerConnection; observation: import('./canadabuys-client.mjs').Status }>;

export interface EvidenceIntakePreparation {
 schema: 'stellar-forge.canadabuys-customer-intake.v1'; state: 'PREPARED' | 'SAVE_REVISION_REFRESHED';
 requestFile: FileIdentity & { path: string; reused: boolean };
 workspaceId: string; noticeId: string; commandId: string; expectedRevision: number; applyRevision?: number;
 documents: Array<{ index: number; title?: string; bytes?: number; sha256?: string }>;
 mutation: false; manifest?: FileIdentity & { path: string }; originalRequest?: FileIdentity & { path: string };
}
export interface EvidenceIntakeManifest {
 noticeId: string; commandId: string; capturedAt?: string; sourceUrl?: string;
 documents: Array<{ path: string; capturedAt?: string; sha256?: string; bytes?: number; [key: string]: unknown }>;
}
export declare function prepareCanadaBuysEvidenceIntake(options: {
 client: CanadaBuysMerchantClient; manifestPath: string; outputPath: string; signal?: AbortSignal;
}): Promise<EvidenceIntakePreparation>;
export declare function refreshCanadaBuysEvidenceIntake(options: {
 client: CanadaBuysMerchantClient; requestPath: string; outputPath: string; signal?: AbortSignal;
}): Promise<EvidenceIntakePreparation>;
export declare function prepareCanadaBuysIntakeOperation(options: {
 client: CanadaBuysMerchantClient; connection: CustomerConnection; directory: string; operationId: string;
 input: string; expectedSha256?: string; signal?: AbortSignal;
}): Promise<Awaited<ReturnType<typeof prepareCanadaBuysOperation>> & {
 inspection: import('./canadabuys-client.mjs').EvidenceIntakeInspection;
}>;
