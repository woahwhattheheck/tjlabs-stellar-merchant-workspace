// MIT. Original gRPC product client and retained receiving types.
import type { OperationsSelection, IncidentEdit, Requests as OperationsRequests } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/grpc/operations/client.mjs';
export type { OperationsSelection, IncidentEdit } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/grpc/operations/client.mjs';
export type GrpcToolName =
  "merchant_grpc_attempt"
  | "merchant_grpc_call"
  | "merchant_grpc_cancel_call"
  | "merchant_grpc_capture"
  | "merchant_grpc_checkout"
  | "merchant_grpc_export"
  | "merchant_grpc_export_file"
  | "merchant_grpc_export_file_release"
  | "merchant_grpc_export_manifest"
  | "merchant_grpc_health_export"
  | "merchant_grpc_health_observations"
  | "merchant_grpc_health_read"
  | "merchant_grpc_health_resume"
  | "merchant_grpc_health_start"
  | "merchant_grpc_health_stop"
  | "merchant_grpc_import"
  | "merchant_grpc_inventory"
  | "merchant_grpc_method"
  | "merchant_grpc_operations_capture"
  | "merchant_grpc_operations_captures"
  | "merchant_grpc_operations_read"
  | "merchant_grpc_operations_cases"
  | "merchant_grpc_operations_case"
  | "merchant_grpc_operations_save"
  | "merchant_grpc_operations_export"
  | "merchant_grpc_operations_receive"
  | "merchant_grpc_prepare"
  | "merchant_grpc_reflection_capture"
  | "merchant_grpc_reflection_inventory"
  | "merchant_grpc_reflection_open"
  | "merchant_grpc_reflection_save"
  | "merchant_grpc_release_activate"
  | "merchant_grpc_release_close"
  | "merchant_grpc_release_diff"
  | "merchant_grpc_release_open"
  | "merchant_grpc_release_restart"
  | "merchant_grpc_release_rollback"
  | "merchant_grpc_release_run"
  | "merchant_grpc_release_status"
  | "merchant_grpc_release_stop"
  | "merchant_grpc_review"
  | "merchant_grpc_revision"
  | "merchant_grpc_run"
  | "merchant_grpc_save"
  | "merchant_grpc_stage"
  | "merchant_grpc_status"
  | "merchant_grpc_stop"
  | "merchant_grpc_upgrade_adopt"
  | "merchant_grpc_upgrade_export"
  | "merchant_grpc_upgrade_method"
  | "merchant_grpc_upgrade_open"
  | "merchant_grpc_upgrade_review"
  | "merchant_grpc_upgrade_reviews"
  | "merchant_grpc_validate_input"
  | "merchant_grpc_workspaces";

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type NativeResult = Record<string, Json>;
export type HealthRequest =
  | { kind: 'check'; service?: string; timeoutMs?: number }
  | { kind: 'list'; timeoutMs?: number }
  | { kind: 'watch'; service?: string; timeoutMs?: number; durationMs?: number; maxEvents?: number };
export interface PageSelection { offset?: number; limit?: number; expectedSnapshot?: string; }
export interface HealthPageSelection {
  operationId: string; section?: 'summary' | 'events' | 'services'; afterSequence?: number;
  throughSequence?: number; expectedSnapshot?: string; limit?: number; serviceFilter?: string;
}
export interface ReceivedFile { name: string; path: string; bytes: number; sha256: string; contentType: string; }
export interface GrpcReceived {
  schema: 'stellar-forge.grpc-product-received.v1'; state: 'COMPLETE'; directory: string;
  exportId: string; manifestSha256: string; workspace: string;
  kind: 'customer' | 'revision' | 'attempt' | 'stream' | 'result' | 'upgrade' | 'health' | 'operations';
  original: { revision?: string; preparation?: string; operationId?: string; topic?: string; reviewSha256?: string; snapshotSha256?: string };
  files: ReceivedFile[]; bytes: number; customerDirectory?: string; native?: NativeResult;
}
export interface GrpcProductClientOptions {
  directory?: string; connectionFile?: string; productId?: string; workspace?: string;
  environment?: Record<string, string | undefined>; signal?: AbortSignal;
}
export interface CallOptions { requestSignal?: AbortSignal; timeoutMs?: number; }
export interface GrpcToolDefinition {
  name: GrpcToolName; description: string; properties: Record<string, Json>; required: string[];
  annotations?: { readOnly?: boolean; idempotent?: boolean; openWorld?: boolean };
}
export declare function grpcProductTools(): GrpcToolDefinition[];
export declare class GrpcProductClient {
  constructor(options: GrpcProductClientOptions);
  readonly endpoint: string;
  ready(): Promise<{ productId: string; workspace: string; instanceId: string; nativeInstanceId: string; endpoint: string;
    browserUrl: string; mcpUrl: string; operatorUrl: string | null; operatorDirectory: string | null;
    operatorWorkspaceId: string | null; operatorSourceSha256: string | null }>;
  call(name: GrpcToolName, input?: Record<string, Json>, options?: CallOptions): Promise<NativeResult>;
  captureOperations(input: { captureId: string; selection?: OperationsSelection }): Promise<NativeResult>;
  operationsCaptures(page?: PageSelection): Promise<NativeResult>;
  readOperations(input: Omit<OperationsRequests['read'], 'id'> & { captureId: string }): Promise<NativeResult>;
  incidents(selection?: PageSelection & { state?: string; severity?: string; search?: string }): Promise<NativeResult>;
  incident(caseId: string, version?: number): Promise<NativeResult>;
  saveIncident(input: { operationId: string; caseId: string; captureId: string; expectedVersion: number; edit: IncidentEdit }): Promise<NativeResult>;
  exportIncident(input: { caseId: string; version: number }): Promise<NativeResult>;
  receiveIncident(input: { operationId: string } & ({ file: string; exportId?: never } | { exportId: string; file?: never })): Promise<NativeResult>;
  status(): Promise<NativeResult>;
  revision(revision: string, section?: 'summary' | 'source' | 'plan' | 'methods' | 'routes', page?: PageSelection): Promise<NativeResult>;
  inventory(kind: 'revisions' | 'prepared' | 'intents' | 'attempts' | 'reflections' | 'exports', page?: PageSelection): Promise<NativeResult>;
  attempt(operationId: string): Promise<NativeResult>;
  stopCall(operationId: string): Promise<NativeResult>;
  callMethod(input: { revision: string; operationId: string; method: string } & ({ input: Record<string, Json>; file?: never } | { file: string; input?: never })): Promise<NativeResult>;
  prepare(input: { revision: string; operationId: string }): Promise<NativeResult>;
  startHealth(input: { revision: string; operationId: string; request: HealthRequest }): Promise<NativeResult>;
  readHealth(input: HealthPageSelection): Promise<NativeResult>;
  healthStop(operationId: string): Promise<NativeResult>;
  resumeHealth(input: { operationId: string; expectedVersion: number }): Promise<NativeResult>;
  exportHealth(input: { operationId: string; expectedVersion?: number; throughSequence?: number; expectedSnapshot?: string }): Promise<NativeResult>;
  inspectExport(exportId: string): Promise<{ manifest: Record<string, Json>; manifestSha256: string; [key: string]: unknown }>;
  receive(options: { exportId: string; directory: string; expectedManifestSha256?: string; chunkSize?: number;
    signal?: AbortSignal; onProgress?: (progress: NativeResult) => void | Promise<void> }): Promise<Record<string, unknown>>;
}
export declare function inspectReceivedGrpcProduct(directory: string, expected?: { expectedExportId?: string; expectedManifestSha256?: string }): Promise<GrpcReceived>;
