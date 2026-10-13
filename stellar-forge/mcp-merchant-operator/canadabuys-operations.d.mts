import type { CanadaBuysMerchantClient, SelectedTool, ToolArguments, ShortTool, FullToolName } from './canadabuys-client.mjs';
export interface CustomerConnection {
 schema: 'stellar-forge.canadabuys-customer-connection.v1'; url: string; tokenEnv: string; workspace: string;
 workspaceId: string | null; maximumResponseBytes: number;
}
export interface OperationRequest {
 schema: 'stellar-forge.canadabuys-customer-operation.v1'; operationId: string; connection: CustomerConnection;
 request: { name: FullToolName; arguments: Record<string, unknown> };
 replay: { replayable: boolean; basis: string; commandId?: string; captureId?: string };
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
