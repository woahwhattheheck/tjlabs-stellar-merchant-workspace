/// <reference types="node" />
import type {Server} from 'node:http';

export const REQUEST_SCHEMA: 'stellar-forge.prepaid-api-starter.v1';
export const PLAN_SCHEMA: 'stellar-forge.prepaid-api-starter-plan.v1';
export const RESULT_SCHEMA: 'stellar-forge.prepaid-api-starter-result.v1';
export const CUSTOMER_SCHEMA: 'stellar-forge.prepaid-api-customer-setup.v1';

export interface NativePayment {
  scheme: 'exact';
  network: 'stellar:testnet' | 'stellar:pubnet';
  /** Original Stellar asset contract address. */
  asset: string;
  /** Original merchant Stellar recipient. */
  payTo: string;
  /** Atomic asset units as a decimal string. */
  amount: string;
  maxTimeoutSeconds?: number;
}
export interface PrepaidApiStarterRequest {
  schema: typeof REQUEST_SCHEMA;
  title: string;
  serviceName?: string;
  publicOrigin: string;
  gatewayBaseUrl: string;
  payment: NativePayment;
  checkoutPath?: string;
  checkoutRouteId?: string;
  functionPath?: string;
  allowanceUnits: number;
  requestUnits: number;
  workerPort: number;
  apiPort: number;
  timeoutSeconds?: number;
  actor?: string;
  python?: string;
  backupPassEnv?: string;
}
export type PrepaidApiStarterTemplate = Omit<PrepaidApiStarterRequest, 'publicOrigin' | 'gatewayBaseUrl' | 'payment'> & {
  publicOrigin: null;
  gatewayBaseUrl: null;
  payment: Omit<NativePayment, 'asset' | 'payTo' | 'amount'> & {asset: null; payTo: null; amount: null};
};
export interface SourceMember {name: string; bytes: number; sha256: string}
export interface ExportMember extends SourceMember {contentType: string; downloadUrl: string}
export interface ReceivedMember extends SourceMember {contentType: string}
export interface NativeOfferDraft {
  title: string;
  allowanceUnits: number;
  workerPort: number;
  apiPort: number;
  routes: Array<{id: string; functionId: string; method: 'POST'; path: string; units: number; timeoutSeconds: number}>;
}
export interface PrepaidApiSetup {
  schema: typeof RESULT_SCHEMA;
  setupId: string;
  directory: string;
  inputSha256: string;
  planSha256: string;
  config: string;
  configSha256: string;
  sourceSha256: string;
  merchant: string;
  checkout: string;
  workspaceDirectory: string;
  launchFile: string;
  applicationRoot: string;
  offerDraftFile: string;
  exampleFile: string;
  draft: NativeOfferDraft;
  payment: Record<string, unknown>;
  backupPassEnv: string;
  files: SourceMember[];
}
export function requestTemplate(): PrepaidApiStarterTemplate;
export function readPrepaidApiRequest(path: string): Promise<PrepaidApiStarterRequest>;
export function preparePrepaidApi(options: {directory: string; request: PrepaidApiStarterRequest}): Promise<PrepaidApiSetup>;
export function inspectPrepaidApi(directory: string): Promise<PrepaidApiSetup>;

export type NativeOperationStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'ATTENTION' | 'CANCELLED';
export interface NativeOperation {
  id: string;
  kind: string;
  status: NativeOperationStatus;
  requestSha256: string;
  request?: {operationId: string; expectedRevision: number; [key: string]: unknown};
  result: Record<string, unknown> | null;
  error: {code: string; status?: number} | null;
  [key: string]: unknown;
}
export interface AdmissionRejection {
  schema: 'stellar-forge.prepaid-api-admission-rejection.v1';
  workflowId: string;
  operationId: string;
  requestSha256: string;
  code: 'API_MERCHANT_WORKSPACE_REVISION_CHANGED';
  status: 409;
  outcomeUnknown: false;
  operationAbsent: true;
  observedAt: string;
}
export type IncompleteWorkflow =
  {status: Exclude<NativeOperationStatus, 'COMPLETED'>; operation: NativeOperation;
    requestFile: string; workflowId: string; stage?: 'prepare' | 'publish'} |
  {status: 'ADMISSION_REJECTED'; operation: null; admission: AdmissionRejection;
    requestFile: string; workflowId: string; stage?: 'prepare' | 'publish'};
export interface WorkflowOptions {
  directory: string;
  launchFile: string;
  /** Continue original ATTENTION work or the next recorded definite admission rejection. */
  resume?: boolean;
  /** Return a still-active operation when this wait expires; no native cancellation. */
  maxWaitMs?: number;
  signal?: AbortSignal;
}
export interface PrepaidApiPublication {
  schema: 'stellar-forge.prepaid-api-publication.v1';
  status: 'READY';
  setupId: string;
  workspaceId: string;
  workflowId: string;
  offerId: string;
  offer: Record<string, unknown>;
  files: ExportMember[];
  operations: {prepare: string; publish: string};
}
export interface NativeExport {
  schema: 'stellar-forge.sf101.api-merchant-export.v1';
  id: string;
  kind: string;
  label: string;
  createdAt: string;
  files: ExportMember[];
}
export interface CustomerHandoff {
  schema: 'stellar-forge.prepaid-api-customer-handoff.v1';
  status: 'READY';
  setupId: string;
  workspaceId: string;
  workflowId: string;
  orderReference: string;
  offerId: string;
  operationId: string;
  export: NativeExport;
}
export interface ReceivedCustomer {
  schema: 'stellar-forge.prepaid-api-customer-files.v1';
  status: 'COMPLETE';
  workspaceId: string;
  orderReference: string;
  offerId: string;
  exportId: string;
  directory: string;
  files: ReceivedMember[];
}
export function publishPrepaidApi(options: WorkflowOptions): Promise<PrepaidApiPublication | IncompleteWorkflow>;
export function preparePrepaidCustomer(options: WorkflowOptions & {orderReference: string; label: string}):
  Promise<CustomerHandoff | IncompleteWorkflow>;
export function downloadPrepaidCustomer(options: {directory: string; launchFile: string; orderReference: string;
  out: string; signal?: AbortSignal}): Promise<ReceivedCustomer>;

export interface CustomerFileBinding {
  /** Current verified physical receiving directory. */
  directory: string;
  /** Original physical destination retained inside the immutable receiving record. */
  sourceDirectory: string;
  receivingSha256: string;
  completeSha256: string;
  merchantWorkspaceId: string;
  orderReference: string;
  offerId: string;
  exportId: string;
  manifestSha256: string;
  handoffSha256: string;
  gatewayBaseUrl: string;
  claimEnv: string;
  files: ReceivedMember[];
}
export function inspectPrepaidCustomerFiles(directory: string):
  Promise<CustomerFileBinding & {payment: Record<string, unknown>; purchaseUrl: string}>;
interface CustomerWorkspaceCommon {
  handoffDirectory: string;
  directory: string;
  title?: string;
  python?: string;
  runtimeDirectory?: string;
  buyerStateDirectory?: string;
  inboxDirectory?: string;
}
export type CustomerWorkspaceOptions = CustomerWorkspaceCommon & (
  {mode?: 'purchase'; buyerWorkspace: string; intentId: string} |
  {mode: 'access'; buyerWorkspace?: string | null; intentId?: null}
);
export interface PrepaidCustomerSetup {
  schema: typeof CUSTOMER_SCHEMA;
  id: string;
  directory: string;
  mode: 'purchase' | 'access';
  intentId: string | null;
  title: string;
  handoffDirectory: string;
  binding: CustomerFileBinding;
  workspaceConfig: string;
  workspaceConfigSha256: string;
  workspaceDirectory: string;
  configurationFile: string;
  bootstrapOperationId: string;
  sourcePlanSha256: string;
}
export function preparePrepaidCustomerWorkspace(options: CustomerWorkspaceOptions): Promise<PrepaidCustomerSetup>;
export function inspectPrepaidCustomerWorkspace(configurationFile: string): Promise<PrepaidCustomerSetup>;
export interface PrepaidCustomerServer {
  server: Server;
  model: unknown;
  url: string;
  origin: string;
  port: number;
  workspaceId: string;
  launchFile: string;
  launch: Record<string, unknown>;
  close(): Promise<void>;
  prepaid: {
    schema: 'stellar-forge.prepaid-api-customer-open.v1';
    configurationFile: string;
    workspaceId: string;
    profileId: string;
    operationId: string;
    orderReference: string;
    mode: 'purchase' | 'access';
    reused: boolean;
  };
}
export function servePrepaidCustomer(options: {
  configurationFile: string;
  port?: number;
  environment?: NodeJS.ProcessEnv;
  approvalMode?: 'auto' | 'browser' | 'terminal';
  approvalModule?: string;
  expectedApprovalSha256?: string;
  agentDirectory?: string;
  expectedAgentSetupSha256?: string;
  expectedWorkspaceSha256?: string;
}): Promise<PrepaidCustomerServer>;
