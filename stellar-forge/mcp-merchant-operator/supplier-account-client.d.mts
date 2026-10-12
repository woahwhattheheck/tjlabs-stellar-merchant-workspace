/** MIT. Original supplier-account client, complete review and receiving contracts. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };
export type Sha256 = string;
export type WorkspaceId = string;
export type ChangeId = string;
export interface CallOptions { requestSignal?: AbortSignal; timeoutMs?: number; }
export interface MerchantClient {
  endpoint: string;
  call(name: string, args: JsonObject, options?: CallOptions): Promise<JsonObject>;
}
export interface Account {
  alias: string; directory: string; account: string; apiKeyEnv?: string | null;
  requestsPerSecond: number; callsPerDay: number;
}
export interface Assignment { binding: string; account: string | null; }
export interface WorkspacePin { workspaceId?: WorkspaceId; }
export interface SourcePin extends WorkspacePin { sourceSha256: Sha256; note?: string; }
export interface PrepareRequest extends SourcePin { accounts: Account[]; assignments: Assignment[]; }
export interface ContinueReview extends SourcePin { id: ChangeId; }
export interface ChangeSelection extends WorkspacePin { id: ChangeId; revision: number; }
export interface ReviewedChange extends ChangeSelection { reviewSha256: Sha256; }
export interface SourceIdentity {
  path: string; sha256: Sha256; bytes: number; device: string; inode: string; readAt?: string;
}
export interface Review {
  schema: 'stellar-forge.supplier-account-review.v1'; id: ChangeId; createdAt: string;
  restores: ChangeId | null; rebases: ChangeId | null; note: string;
  source: SourceIdentity; target: { sha256: Sha256; bytes: number };
  accounts: JsonObject[]; assignments: JsonObject[]; effect: string; activation: string; usage: string;
}
export interface Change {
  id: ChangeId; revision: number; status: 'PREPARED' | 'APPLYING' | 'APPLIED' | 'CONFLICT' | 'CANCELLED';
  createdAt: string; updatedAt: string; reviewSha256: Sha256; review: Review; outcome: JsonObject | null;
}
export interface RetainedChange extends Omit<Change, 'review' | 'outcome'> {
  fullChangeRetained: true; receivingTool: string;
}
export interface OperationResult {
  schema: 'stellar-forge.supplier-account-operation.v1';
  workspace: string; workspaceId: WorkspaceId; operation: string; state: 'COMPLETE' | 'NATIVE_ERROR';
  change: Change | RetainedChange | null;
  error?: { code: string; reason: string; changeId?: ChangeId };
}
export interface WorkspaceStatus {
  workspace: string; label?: string; workspaceId?: WorkspaceId; state: 'OPEN' | 'CLOSED' | 'CLOSING';
  reads?: JsonObject;
}
export interface HistoryRequest { offset?: number; limit?: number; expectedToken?: Sha256; }
export interface HistoryPage {
  workspaceId: WorkspaceId; token: Sha256; offset: number; limit: number;
  total: number; items: Change[]; nextOffset: number | null;
}
export interface Proposal {
  workspaceId: WorkspaceId; sourceSha256: Sha256; accounts: Account[]; assignments: Assignment[];
}
export interface ExportSelection extends WorkspacePin { exportId: string; }
export interface ExportFile {
  name: 'operator-report.json' | 'workspace-backup.json'; bytes: number; sha256: Sha256; type: 'application/json';
}
export interface ExportManifest {
  schema: 'stellar-forge.supplier-account-export.v1'; exportId: string; workspaceId: WorkspaceId;
  kind: 'report' | 'backup'; createdAt: string; files: [ExportFile];
}
export interface ManifestResult {
  state: 'MANIFEST_RETAINED'; exportId: string; workspaceId: WorkspaceId;
  manifestFile: { name: string; bytes: number; sha256: Sha256 };
  manifestSha256: Sha256; manifest: ExportManifest;
}
export interface FileRequest {
  exportId: string; file: string; expectedManifestSha256: Sha256; expectedSha256: Sha256;
  readId?: string; offset?: number; limit?: number;
}
export interface ReceiveRequest extends WorkspacePin { inputId: string; expectedSha256: Sha256; }
export interface ReceivingResult {
  schema: 'stellar-forge.supplier-account-receiving-operation.v1'; workspace: string;
  workspaceId: WorkspaceId | null; state: 'RECEIVED' | 'NATIVE_ERROR'; inputId: string;
  inputSha256: Sha256; backupSha256: Sha256; received: JsonObject | null;
  reopened: WorkspaceStatus | null; error?: { code: string; reason: string; reopenCode?: string };
}
export interface DownloadOptions {
  exportId: string; directory: string; chunkSize?: number; expectedManifestSha256?: Sha256;
  signal?: AbortSignal; onProgress?: (progress: JsonObject) => void | Promise<void>;
}
export declare const SUPPLIER_ACCOUNT_CLIENT_METHODS: Readonly<{
  status: 'status'; open: 'open'; close: 'close'; inputs: 'inputs'; state: 'state'; history: 'history';
  change: 'change'; proposal: 'proposal'; prepare: 'prepare'; prepareRestore: 'prepare_restore';
  prepareRebase: 'prepare_rebase'; apply: 'apply'; recover: 'recover'; cancel: 'cancel'; quota: 'quota';
  exportReport: 'export_report'; exportBackup: 'export_backup'; exportManifest: 'export_manifest';
  exportFile: 'export_file'; exportFileRelease: 'export_file_release'; receiveWorkspace: 'receive_workspace';
}>;
export type SupplierAccountMethod = keyof typeof SUPPLIER_ACCOUNT_CLIENT_METHODS;
export type SupplierAccountTool = 'merchant_supplier_account_' extends infer P extends string
  ? typeof SUPPLIER_ACCOUNT_CLIENT_METHODS[SupplierAccountMethod] extends infer S extends string ? `${P}${S}` : never : never;
export declare class SupplierAccountClient {
  readonly workspace: string; readonly endpoint: string; readonly workspaceId: WorkspaceId | null;
  constructor(client: MerchantClient, workspace: string, callOptions?: CallOptions);
  call(name: SupplierAccountTool, args?: JsonObject, options?: CallOptions): Promise<JsonObject>;
  status(args?: {}, options?: CallOptions): Promise<WorkspaceStatus>;
  open(args?: {}, options?: CallOptions): Promise<WorkspaceStatus>;
  close(args?: {}, options?: CallOptions): Promise<WorkspaceStatus>;
  inputs(args?: {}, options?: CallOptions): Promise<{ workspace: string; inputs: Array<{ inputId: string; kind: 'backup'; bytes: number; sha256: Sha256; provenance?: JsonObject }> }>;
  state(args?: {}, options?: CallOptions): Promise<JsonObject>;
  history(args?: HistoryRequest, options?: CallOptions): Promise<HistoryPage>;
  change(args: { id: ChangeId }, options?: CallOptions): Promise<Change>;
  proposal(args?: {}, options?: CallOptions): Promise<Proposal>;
  prepare(args: PrepareRequest, options?: CallOptions): Promise<OperationResult>;
  prepareRestore(args: ContinueReview, options?: CallOptions): Promise<OperationResult>;
  prepareRebase(args: ContinueReview, options?: CallOptions): Promise<OperationResult>;
  apply(args: ReviewedChange, options?: CallOptions): Promise<OperationResult>;
  recover(args: ReviewedChange, options?: CallOptions): Promise<OperationResult>;
  cancel(args: ChangeSelection, options?: CallOptions): Promise<OperationResult>;
  quota(args?: {}, options?: CallOptions): Promise<JsonObject>;
  exportReport(args: ExportSelection, options?: CallOptions): Promise<ManifestResult>;
  exportBackup(args: ExportSelection, options?: CallOptions): Promise<ManifestResult>;
  exportManifest(args: { exportId: string }, options?: CallOptions): Promise<ManifestResult>;
  exportFile(args: FileRequest, options?: CallOptions): Promise<JsonObject>;
  exportFileRelease(args: { exportId: string; readId: string }, options?: CallOptions): Promise<{ exportId: string; readId: string; released: true }>;
  receiveWorkspace(args: ReceiveRequest, options?: CallOptions): Promise<ReceivingResult>;
  pages(method: 'history', args?: HistoryRequest, options?: CallOptions): AsyncGenerator<HistoryPage>;
  inspectExport(exportId: string): Promise<{ manifest: ExportManifest; manifestSha256: Sha256 }>;
  downloadExport(options: DownloadOptions): Promise<JsonObject>;
}
export declare function createSupplierAccountClient(options: {
  workspace: string; client?: MerchantClient; url?: string; tokenEnv?: string;
  environment?: Record<string, string | undefined>; signal?: AbortSignal; callOptions?: CallOptions;
}): Promise<SupplierAccountClient>;
