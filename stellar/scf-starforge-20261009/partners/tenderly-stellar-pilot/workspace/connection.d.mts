/// <reference types="node" />
import type { Buffer } from 'node:buffer';

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonRecord = { [key: string]: Json };
export type ProfileId = `p-${string}`;
export type RequestId = `r-${string}`;
export type Sha256 = string;
export type InstanceId = string;
export type OperationState = 'IN_FLIGHT' | 'COMPLETE' | 'UNCERTAIN' | 'RETRY_READY';
export interface SimulationRequest {
  block_number: number; transaction_index: number; from: string; to: string;
  input: string; gas: number; value: string;
}
export interface MerchantPlan {
  schema: 'stellar-forge.tenderly-merchant-plan.v1';
  serviceName: string; publicOrigin: string; routePath: string;
  provider: { account: string; project: string; accessKeyEnv: string };
  networkId: string; simulationType: 'quick' | 'abi' | 'full';
  payment: { scheme: 'exact'; network: string; asset: string; payTo: string;
    amount: string; maxTimeoutSeconds: number; extra?: JsonRecord };
  operations: { scope: string; keyEnv: string; maxTicketSeconds: number;
    maxEntries: number; maxStoredBytes: number; waitMs: number };
  limits: { maxGas: number; maxInputBytes: number; maxResponseBytes: number;
    timeoutMs: number; maxInFlight: number };
}
export interface PlanReview {
  schema: string; plan: MerchantPlan; planSha256: Sha256; serviceName: string;
  publicOrigin: string; route: { id: string; method: 'POST'; path: string; url: string };
  provider: MerchantPlan['provider'] & { origin: string; path: string };
  networkId: string; simulationType: MerchantPlan['simulationType'];
  payment: MerchantPlan['payment']; operations: MerchantPlan['operations'];
  limits: MerchantPlan['limits']; requiredEnvironment: string[];
}
export interface WorkspaceIdentity {
  schema: 'stellar-forge.tenderly-workspace.v1'; id: string; createdAt: string;
}
export interface WorkspaceStatus {
  workspace: string; directory: string; profile: ProfileId | null;
  serviceName: string | null; state: 'RUNNING' | 'OPEN' | 'CLOSED';
  merchant: { url: string; mode: string } | null; operations: JsonRecord | null;
}
export interface Page<T> { records: T[]; nextCursor: string | null }
export interface Profile {
  id: ProfileId; label: string; createdAt: string; plan: MerchantPlan;
  review: PlanReview; directory: string;
}
export type ProfileSummary =
  | { id: ProfileId; status: 'SAVED'; label: string; createdAt: string;
      serviceName: string; planSha256: Sha256; networkId: string }
  | { id: ProfileId; status: 'UNAVAILABLE'; error: string };
export interface PreparedProfile {
  schema: string; profile: ProfileId; planSha256: Sha256; createdAt: string;
  directory: string; stateDirectory: string; planFile: string; serviceFile: string;
  upstreamsFile: string; openapiFile: string; clientDirectory: string;
  [key: string]: unknown;
}
export interface RequestPacket {
  schema: 'stellar-forge.tenderly-workspace-request.v1'; profile: ProfileId;
  planSha256: Sha256; merchant: PlanReview['route']; payment: MerchantPlan['payment'];
  body: SimulationRequest; operation: JsonRecord & { operationKey: string };
  customer: { id: string; subject: string };
}
export interface SavedRequest { id: RequestId; packet: RequestPacket; createdAt: string }
export interface RequestSummary { id: RequestId; createdAt: string; operationKey: string; subject: string | null }
export interface OperationSelection { profile: ProfileId; operationKey: Sha256 }
export interface ProviderResponseSelection { profile: ProfileId; lookupId: Sha256; observationId: InstanceId }
export type DownloadSelection =
  | { profile: ProfileId; kind: 'plan'; id?: never; observationId?: never }
  | { profile: ProfileId; kind: 'request'; id: RequestId; observationId?: never }
  | { profile: ProfileId; kind: 'response'; id: Sha256; observationId?: never }
  | { profile: ProfileId; kind: 'provider-response'; id: Sha256; observationId: InstanceId };
export interface CompleteDownload { bytes: Buffer; sha256: Sha256; name: string; mime: string }
export interface ResponseMetadata {
  status: number; headers: Record<string, string>; summary: JsonRecord | null;
  name: string; bytes: number; sha256: Sha256; preview: string; previewTruncated: boolean;
}
export interface CompleteResponse extends Omit<ResponseMetadata, 'bytes' | 'preview' | 'previewTruncated'> { bytes: Buffer }
export type Recovery =
  | (OperationSelection & { requestHash: Sha256; expectedGeneration: number; reference: string;
      action: 'complete'; response: { status: number; headers: Record<string, string>; bodyBase64: string } })
  | (OperationSelection & { requestHash: Sha256; expectedGeneration: number; reference: string;
      action: 'retry'; response?: never });
export interface ProviderRecovery extends ProviderResponseSelection { expectedGeneration: number; reference: string }
export interface ConnectionOptions {
  directory?: string | null; workspaceId?: string | null; workspaceSha256?: Sha256 | null;
  expectedInstanceId?: InstanceId | null;
}
export interface ConnectionIdentity {
  schema: 'stellar-forge.tenderly-live-connection.v1'; instanceId: InstanceId;
  startedAt: string; pid: number; directory: string; workspaceId: string;
  workspaceSha256: Sha256; origin: string; planFile: string | null;
  planSha256: Sha256 | null; facilitator: string | null;
}
export interface PrivateConnection extends ConnectionIdentity { token: string }
export interface ConnectionSummary extends ConnectionIdentity { connectionFile: string; connectionSha256: Sha256 }
export const TENDERLY_CONNECTION_SCHEMA: 'stellar-forge.tenderly-live-connection.v1';
export const TENDERLY_CONNECTION_FILENAME: 'tenderly.connection.json';
export const TENDERLY_LISTENER_SCHEMA: 'stellar-forge.tenderly-listener.v1';
export const TENDERLY_MAX_FILE_BYTES: number;
export function tenderlyConnectionFailure(code: string, message: string, status?: number):
  Error & { code: string; status: number };
/** Reads an operator-private credential. For ordinary operation use Client.connect. */
export function readTenderlyWorkspaceConnection(path: string, options?: ConnectionOptions): Promise<{
  path: string; sha256: Sha256; value: PrivateConnection;
  directory: { path: string; dev: number; ino: number }; manifest: Readonly<WorkspaceIdentity>;
}>;
export interface ListenerReservation {
  directory: string; instanceId: InstanceId; startedAt: string; pid: number;
  publish(input: Pick<PrivateConnection, 'origin' | 'token' | 'workspaceId' | 'workspaceSha256'> &
    Partial<Pick<PrivateConnection, 'planFile' | 'planSha256' | 'facilitator'>>): Promise<Readonly<{
      path: string; sha256: Sha256; bytes: number; instanceId: InstanceId; workspaceId: string;
    }>>;
  retire(): Promise<void>;
}
export function claimTenderlyListener(directory: string): Promise<ListenerReservation>;
/** One attachment, one original listener. close() detaches after accepted requests drain. */
export class TenderlyWorkspaceClient {
  private constructor();
  static connect(path: string, options?: ConnectionOptions): Promise<TenderlyWorkspaceClient>;
  get connection(): Readonly<ConnectionSummary>;
  get manifest(): Readonly<WorkspaceIdentity>;
  get lastStatus(): WorkspaceStatus | null;
  get lastStatusAt(): string | null;
  browser(): Promise<{ url: string; instanceId: InstanceId; workspaceId: string }>;
  bootstrap(): Promise<WorkspaceIdentity & { directory: string; template: MerchantPlan;
    initialProfile: Profile | null; profiles: Page<ProfileSummary>; status: WorkspaceStatus }>;
  status(): Promise<WorkspaceStatus>;
  profiles(input?: { before?: ProfileId; limit?: number }): Promise<Page<ProfileSummary>>;
  inspectProfile(profile: ProfileId): Promise<Profile>;
  preview(plan: MerchantPlan): Promise<PlanReview>;
  saveProfile(input: { plan: MerchantPlan; label?: string }): Promise<Profile>;
  prepare(profile: ProfileId): Promise<PreparedProfile>;
  openProfile(profile: ProfileId): Promise<WorkspaceStatus>;
  start(input: { profile: ProfileId; port?: number; operationsPort?: number }): Promise<WorkspaceStatus>;
  stop(profile: ProfileId): Promise<WorkspaceStatus>;
  issue(input: { profile: ProfileId; body: SimulationRequest; id: string;
    subject: string; expiresAt: number }): Promise<SavedRequest>;
  requests(input: { profile: ProfileId; before?: RequestId; limit?: number }): Promise<Page<RequestSummary>>;
  inspectRequest(id: RequestId): Promise<SavedRequest>;
  operations(input: { profile: ProfileId; state?: OperationState; cursor?: string; limit?: number }): Promise<JsonRecord>;
  operation(input: OperationSelection): Promise<JsonRecord | null>;
  audit(input: OperationSelection & { after?: number; limit?: number }): Promise<JsonRecord>;
  responseMetadata(input: OperationSelection): Promise<ResponseMetadata>;
  response(input: OperationSelection): Promise<CompleteResponse>;
  recover(input: Recovery): Promise<JsonRecord>;
  lookupProvider(input: OperationSelection & { simulationId: string; refresh?: boolean }): Promise<JsonRecord>;
  providerLookups(input: OperationSelection & { before?: Sha256; limit?: number }): Promise<JsonRecord>;
  providerLookup(input: { profile: ProfileId; id: Sha256 }): Promise<JsonRecord>;
  providerResponseMetadata(input: ProviderResponseSelection): Promise<JsonRecord>;
  providerResponse(input: ProviderResponseSelection): Promise<CompleteDownload & { record: JsonRecord }>;
  recoverProvider(input: ProviderRecovery): Promise<JsonRecord>;
  download(input: DownloadSelection): Promise<CompleteDownload>;
  close(): Promise<void>;
}
export function attachTenderlyWorkspace(input: ConnectionOptions & { directory: string }): Promise<{
  client: TenderlyWorkspaceClient; model: TenderlyWorkspaceClient; instanceId: InstanceId;
  origin: string; url: string; ownership: 'managed'; close(): Promise<void>;
}>;
