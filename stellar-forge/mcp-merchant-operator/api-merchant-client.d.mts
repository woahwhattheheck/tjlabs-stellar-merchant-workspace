export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };
export type WorkspaceAlias = string;
export type UUID = string;
export type SHA256 = string;
export type NativeAction =
 | 'source_refresh' | 'offer_prepare' | 'offer_publish' | 'offer_adopt' | 'order_prepare' | 'order_adopt'
 | 'start' | 'stop' | 'attach_pass' | 'access' | 'recover_call' | 'release_call'
 | 'export_usage' | 'export_result' | 'backup' | 'restore';
export type Collection = 'offers' | 'orders' | 'operations' | 'exports' | 'backups' | 'functions';
export interface RequestOptions { requestSignal?: AbortSignal | null; timeoutMs?: number }
export type StructuredMcpCall = (name: string, args: JsonObject, options?: RequestOptions) => Promise<unknown>;
export interface ConnectionOptions {
 url: string; tokenEnv?: string; environment?: Record<string, string | undefined>; signal?: AbortSignal;
 workspace: WorkspaceAlias; workspaceId?: UUID;
}
export interface ClientOptions {
 workspace: WorkspaceAlias; workspaceId: UUID; call: StructuredMcpCall; endpoint?: string;
}
export interface Mutation { operationId: UUID; expectedRevision: number }
export interface Route { id: string; functionId: string; units: number; timeoutSeconds: number }
export interface OfferSpecification { title: string; allowanceUnits: number; routes: Route[]; workerPort: number; apiPort: number }
export interface OrderSelection { offerId: UUID; orderReference: string; label: string }
export interface CallSelection { offerId: UUID; orderReference: string; requestId: string; callRevision: number; reason: string }
export type AccessChange =
 | { orderReference: string; accessRevision: number; action: 'expire'; reason: string; expiresAt: string }
 | { orderReference: string; accessRevision: number; action: 'suspend' | 'resume' | 'clear-expiry'; reason: string; expiresAt?: null };
export interface ActionArguments {
 source_refresh: Mutation;
 offer_prepare: Mutation & OfferSpecification & { expectedSourceSha256: SHA256 };
 offer_publish: Mutation & { offerId: UUID };
 offer_adopt: Mutation & { application: string; label: string };
 order_prepare: Mutation & OrderSelection;
 order_adopt: Mutation & OrderSelection;
 start: Mutation & { offerId: UUID };
 stop: Mutation;
 attach_pass: Mutation & { orderReference: string };
 access: Mutation & AccessChange;
 recover_call: Mutation & CallSelection;
 release_call: Mutation & CallSelection;
 export_usage: Mutation & { orderReference: string };
 export_result: Mutation & { offerId: UUID; executionId: string };
 backup: Mutation & { offerId: UUID; label: string; resumeService: boolean };
 restore: Mutation & { backupId: UUID; label: string };
}
export interface NativeOperation {
 id: UUID; kind: NativeAction; status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'ATTENTION' | 'CANCELLED';
 requestSha256: SHA256; createdAt: string; updatedAt: string;
 attempts: JsonObject[]; result: JsonValue; error: JsonValue;
 request?: JsonObject;
}
export interface Acceptance { operation: NativeOperation; workspaceRevision: number; replayed?: boolean }
export interface WorkspaceSummary {
 workspace: string; workspaceId: UUID; label: string; configSha256: SHA256;
 applications: Array<{ handle: string; label: string; profileFileSha256: SHA256; planFileSha256: SHA256 }>;
 receiving: Array<{ handle: string; label: string; metadataSha256: SHA256 }>;
 files: unknown;
}
export interface WorkspaceInventory { configured: boolean; closing: boolean; pendingRequests: number; workspaces: WorkspaceSummary[] }
export interface WorkspaceView {
 workspaceId: UUID; revision: number; source: JsonObject; fault: JsonValue; service: JsonValue;
 counts: Record<Collection, number>;
}
export interface InventoryPage {
 workspaceId: UUID; collection: Collection; revision: number; offset: number; limit: number;
 total: number; nextOffset: number | null; items: JsonObject[];
}
export interface CompleteInventory {
 workspaceId: UUID; collection: Collection; revision: number; total: number; items: JsonObject[];
}
export interface FileMetadata { name: string; bytes: number; sha256: SHA256; contentType: string }
export interface NativeManifest {
 schema: 'stellar-forge.sf101.api-merchant-export.v1'; id: UUID; exportId: UUID;
 kind: string; label: string; createdAt: string;
 files: Array<FileMetadata & { path: string }>;
}
export interface RetainedManifest {
 state: 'MANIFEST_RETAINED'; exportId: UUID; workspaceId: UUID;
 kind: string; label: string; createdAt: string; manifestFile: FileMetadata; files: FileMetadata[];
}
export interface ReadFileArguments {
 exportId: UUID; file: string; expectedManifestSha256: SHA256; expectedSha256: SHA256;
 readId?: UUID; offset?: number; limit?: number;
}
export interface FileChunk {
 exportId: UUID; manifestSha256: SHA256; readId: UUID; file: FileMetadata;
 offset: number; bytesRead: number; nextOffset: number | null; encoding: 'base64'; data: string;
}
export interface DownloadOptions {
 exportId: UUID; directory: string; expectedManifestSha256?: SHA256; signal?: AbortSignal; chunkSize?: number;
 onProgress?: (progress: { exportId: UUID; file: string; bytes: number; total: number; state: 'DOWNLOADING' }) => void | Promise<void>;
}
export interface HttpDownloadOptions extends DownloadOptions {
 workspace: WorkspaceAlias; workspaceId: UUID; url: string; tokenEnv?: string;
 environment?: Record<string, string | undefined>;
}
export interface DownloadResult {
 schema: 'stellar-forge.sf101.api-merchant-mcp-download.v1'; state: 'COMPLETE' | 'REOPENED';
 directory: string; exportId: UUID; workspace: WorkspaceAlias; workspaceId: UUID; kind: string; label: string;
 manifestSha256: SHA256; files: number; bytes: number; resumed?: boolean; resumedBytes?: number;
}
export interface ApiMerchantWorkspaceClient {
 readonly workspace: WorkspaceAlias; readonly workspaceId: UUID; readonly endpoint?: string;
 invoke(kind: string, args?: JsonObject, options?: RequestOptions): Promise<JsonObject>;
 view(args?: Record<string, never>, options?: RequestOptions): Promise<WorkspaceView>;
 inventory(args: { collection: Collection; offset?: number; limit?: number; expectedRevision?: number }, options?: RequestOptions): Promise<InventoryPage>;
 allInventory(collection: Collection, options?: RequestOptions): Promise<CompleteInventory>;
 selections(args?: Record<string, never>, options?: RequestOptions): Promise<{ applications: JsonObject[]; receiving: JsonObject[] }>;
 preview(args: OfferSpecification, options?: RequestOptions): Promise<JsonObject & { sourceSha256: SHA256 }>;
 refreshSource(args: ActionArguments['source_refresh'], options?: RequestOptions): Promise<Acceptance>;
 prepareOffer(args: ActionArguments['offer_prepare'], options?: RequestOptions): Promise<Acceptance>;
 publishOffer(args: ActionArguments['offer_publish'], options?: RequestOptions): Promise<Acceptance>;
 adoptOffer(args: ActionArguments['offer_adopt'], options?: RequestOptions): Promise<Acceptance>;
 prepareOrder(args: ActionArguments['order_prepare'], options?: RequestOptions): Promise<Acceptance>;
 adoptOrder(args: ActionArguments['order_adopt'], options?: RequestOptions): Promise<Acceptance>;
 start(args: ActionArguments['start'], options?: RequestOptions): Promise<Acceptance>;
 stop(args: ActionArguments['stop'], options?: RequestOptions): Promise<Acceptance>;
 attachPass(args: ActionArguments['attach_pass'], options?: RequestOptions): Promise<Acceptance>;
 updateAccess(args: ActionArguments['access'], options?: RequestOptions): Promise<Acceptance>;
 recoverCall(args: ActionArguments['recover_call'], options?: RequestOptions): Promise<Acceptance>;
 releaseCall(args: ActionArguments['release_call'], options?: RequestOptions): Promise<Acceptance>;
 exportUsage(args: ActionArguments['export_usage'], options?: RequestOptions): Promise<Acceptance>;
 exportResult(args: ActionArguments['export_result'], options?: RequestOptions): Promise<Acceptance>;
 backup(args: ActionArguments['backup'], options?: RequestOptions): Promise<Acceptance>;
 restore(args: ActionArguments['restore'], options?: RequestOptions): Promise<Acceptance>;
 run<K extends NativeAction>(kind: K, args: ActionArguments[K], options?: RequestOptions): Promise<NativeOperation>;
 waitOperation(args: { operationId: UUID; requestSha256?: SHA256; pollIntervalMs?: number }, options?: RequestOptions): Promise<NativeOperation>;
 operation(args: { operationId: UUID }, options?: RequestOptions): Promise<NativeOperation>;
 resume(args: { operationId: UUID; requestSha256: SHA256 }, options?: RequestOptions): Promise<Acceptance>;
 cancel(args: { operationId: UUID; requestSha256: SHA256 }, options?: RequestOptions): Promise<NativeOperation>;
 offer(args: { offerId: UUID }, options?: RequestOptions): Promise<JsonObject>;
 order(args: { orderReference: string; after?: string; limit?: number }, options?: RequestOptions): Promise<JsonObject>;
 executions(args: { offerId: UUID; after?: string; limit?: number }, options?: RequestOptions): Promise<JsonObject>;
 execution(args: { offerId: UUID; executionId: string }, options?: RequestOptions): Promise<JsonObject>;
 manifest(args: { exportId: UUID }, options?: RequestOptions): Promise<RetainedManifest>;
 readFileChunk(args: ReadFileArguments, options?: RequestOptions): Promise<FileChunk>;
 releaseFile(args: { exportId: UUID; readId: UUID }, options?: RequestOptions): Promise<{ exportId: UUID; readId: UUID; released: true }>;
 restoreBundle(args: { receiving: string; expectedMetadataSha256: SHA256 }, options?: RequestOptions): Promise<JsonObject>;
 downloadExport(options: DownloadOptions): Promise<DownloadResult>;
 disconnect(): Promise<void>;
}
export function discoverApiMerchantWorkspaces(options: { call: StructuredMcpCall }): Promise<WorkspaceInventory>;
export function createApiMerchantWorkspaceClient(options: ClientOptions): Readonly<ApiMerchantWorkspaceClient>;
export function connectApiMerchantWorkspaceClient(options: ConnectionOptions): Promise<Readonly<ApiMerchantWorkspaceClient>>;
export function downloadApiMerchantExport(options: HttpDownloadOptions): Promise<DownloadResult>;
export function inspectApiMerchantExportDownload(options: Omit<HttpDownloadOptions, 'directory' | 'expectedManifestSha256' | 'chunkSize' | 'onProgress'>): Promise<{ manifest: NativeManifest; manifestSha256: SHA256 }>;
export function reopenApiMerchantExportDownload(options: {
 directory: string; expectedManifestSha256?: SHA256; workspace: WorkspaceAlias; workspaceId: UUID; endpoint?: string;
}): Promise<DownloadResult>;
