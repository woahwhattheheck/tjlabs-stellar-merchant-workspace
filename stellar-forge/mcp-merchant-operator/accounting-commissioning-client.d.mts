import type * as Native from '../../stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/commissioning-collections/client.mjs';
import type {Operation} from '../../stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/client.mjs';
export type {
  CommissioningSourceInput, CommissioningInspection, CommissioningSelection, CommissioningReviewedSelection,
  CommissioningPreview, CommissioningCapture, CommissioningCaptureSummary, CommissioningSourceSummary,
  CommissioningSourcesQuery, CommissioningSourceQuery, CommissioningCapturesQuery, CommissioningCandidateQuery,
  CommissioningCandidateView, CommissioningCandidateMap, CommissioningCandidates, CommissioningReview,
  CommissioningRequestResult, CommissioningStatus,
} from '../../stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/commissioning-collections/client.mjs';

export interface CommissioningCallOptions {requestSignal?: AbortSignal; timeoutMs?: number}
export interface CommissioningStructuredCall {
  (name: string, args: Record<string, unknown>, options?: CommissioningCallOptions): Promise<Record<string, unknown>>;
}
export interface AccountingCommissioningClientOptions {workspace: string; call: CommissioningStructuredCall}
export interface AccountingCommissioningConnectionOptions {
  url: string; workspace: string;
  /** Existing bearer token environment variable; defaults to MCP_ACCESS_TOKEN. */
  tokenEnv?: string; environment?: Record<string, string | undefined>;
  /** Connection-local token for existing authenticated listener; never written to process.env or saved operation files. */
  bearerToken?: string;
  signal?: AbortSignal;
  /** Defaults to the original transport ceiling, 128 MiB, to preserve complete native 8 MiB source inspections. */
  maximumResponseBytes?: number;
}
export interface WorkspaceReply {workspace: string; [key: string]: unknown}
export type InWorkspace<T> = T & {workspace: string};
export type InspectCommissioningSource = Native.CommissioningSourceInput | (
  Omit<Native.CommissioningSourceInput, 'file'> & {sourceAlias: string; file: {name: string}}
);
export interface AccountingCommissioningInspection extends Native.CommissioningInspection {
  workspace: string;
  /** Exact resolved native file bytes and options; use this retained input for import, including alias inspections. */
  sourceInput: Native.CommissioningSourceInput;
}
export type SourceDetailArguments = Native.CommissioningSourceQuery & {sourceId: string};
export type PreviewCommissioningArguments = (Native.CommissioningSelection | Native.CommissioningReviewedSelection) & {sourceId: string};
export type CaptureCommissioningArguments = Native.CaptureCommissioningCollections & {sourceId: string};
export interface CaptureSelector {captureId: string}
export interface RequestSelector {requestId: string}
export type CommissioningFileSelection =
  {kind: 'commissioning-source'; sourceId: string; file: Native.CommissioningSourceFileName | string} |
  {kind: 'commissioning-capture'; captureId: string; file: Native.CommissioningCaptureFileName | 'handover.tar' | string};
export interface CommissioningFileIdentity {name: string; bytes: number; sha256: string; type: string; [key: string]: unknown}
export type SelectedCommissioningFile = CommissioningFileIdentity & {selection: CommissioningFileSelection};
export interface CommissioningFileChunk {
  workspace: string; readId: string; file: CommissioningFileIdentity;
  offset: number; nextOffset: number | null; encoding: 'base64'; data: string; bytesRead: number;
  bytes: Uint8Array; complete: boolean; [key: string]: unknown;
}
export interface CommissioningFileReadOptions {expectedSha256?: string; chunkBytes?: number; signal?: AbortSignal}
export interface CommissioningCompleteFileOptions extends CommissioningFileReadOptions {maximumBytes?: number}
type SourceDetailWithFiles<T> = T extends {files: unknown} ? Omit<T, 'files'> & {files: SelectedCommissioningFile[]} : T;
export type AccountingCommissioningSourceResponse = InWorkspace<SourceDetailWithFiles<Native.CommissioningSourceResponse>>;
export interface AccountingCommissioningCapture extends Omit<Native.CommissioningCapture, 'files'> {
  files: SelectedCommissioningFile[];
}
export interface AccountingCommissioningCaptureDetail {
  workspace: string; revision: number; capture: AccountingCommissioningCapture;
}
export interface AccountingCommissioningExport {
  workspace: string; revision: number; value: Native.CommissioningCapture;
  files: SelectedCommissioningFile[];
  archive: {kind: 'commissioning-capture'; captureId: string; file: 'handover.tar'};
  scope: 'PRIVATE_COMPLETE_ACCOUNT'; scopeDescription: string;
}
export type AccountingCommissioningMutation = 'source_import' | 'capture';
export interface AccountingCommissioningArgumentsMap {
  source_inspect: InspectCommissioningSource;
  source_import: Native.ImportCommissioningSource;
  source_list: Native.CommissioningSourcesQuery;
  source_detail: SourceDetailArguments;
  candidates: Native.CommissioningCandidateQuery;
  preview: PreviewCommissioningArguments;
  capture: CaptureCommissioningArguments;
  capture_list: Native.CommissioningCapturesQuery;
  capture_detail: CaptureSelector;
  capture_export: CaptureSelector;
  request_lookup: RequestSelector;
}
export interface AccountingCommissioningResultMap {
  source_inspect: AccountingCommissioningInspection;
  source_import: InWorkspace<Native.CommissioningImportResult>;
  source_list: InWorkspace<Native.CommissioningPage<Native.CommissioningSourceSummary>>;
  source_detail: AccountingCommissioningSourceResponse;
  candidates: InWorkspace<Native.CommissioningCandidates>;
  preview: InWorkspace<Native.CommissioningPreview>;
  capture: InWorkspace<Native.CommissioningCaptureMutationResult>;
  capture_list: InWorkspace<Native.CommissioningPage<Native.CommissioningCaptureSummary>>;
  capture_detail: AccountingCommissioningCaptureDetail;
  capture_export: AccountingCommissioningExport;
  request_lookup: InWorkspace<Native.CommissioningRequestResult>;
}
export type AccountingCommissioningOperation = keyof AccountingCommissioningArgumentsMap;
export type AccountingCommissioningPagedOperation = 'source_list' | 'source_detail' | 'candidates' | 'capture_list';
export interface CommissioningImportIdentity {
  actor: string; requestId: string; label?: string; receivedAt?: string; replacesSourceId?: string | null;
}
export interface CommissioningOperationIdentity {actor: string; requestId: string}
export interface AccountingCommissioningClient {
  readonly workspace: string;
  open(options?: CommissioningCallOptions): Promise<WorkspaceReply>;
  configuredSources(options?: CommissioningCallOptions): Promise<WorkspaceReply>;
  callOperation<K extends AccountingCommissioningOperation>(
    kind: K, args: AccountingCommissioningArgumentsMap[K], options?: CommissioningCallOptions,
  ): Promise<AccountingCommissioningResultMap[K]>;
  inspectSource(args: InspectCommissioningSource, options?: CommissioningCallOptions): Promise<AccountingCommissioningInspection>;
  importSource(args: Native.ImportCommissioningSource, options?: CommissioningCallOptions): Promise<InWorkspace<Native.CommissioningImportResult>>;
  sources(args?: Native.CommissioningSourcesQuery, options?: CommissioningCallOptions): Promise<InWorkspace<Native.CommissioningPage<Native.CommissioningSourceSummary>>>;
  source(args: SourceDetailArguments & {view?: 'summary'}, options?: CommissioningCallOptions): Promise<InWorkspace<SourceDetailWithFiles<Native.CommissioningSourceDetail>>>;
  source(args: SourceDetailArguments & {view: 'projects'}, options?: CommissioningCallOptions): Promise<InWorkspace<SourceDetailWithFiles<Native.CommissioningSourceProjects>>>;
  source(args: SourceDetailArguments & {view: 'history'}, options?: CommissioningCallOptions): Promise<InWorkspace<SourceDetailWithFiles<Native.CommissioningSourceHistoryPage>>>;
  source(args: SourceDetailArguments, options?: CommissioningCallOptions): Promise<AccountingCommissioningSourceResponse>;
  candidates(args?: Native.CommissioningCandidateQuery<'customers'>, options?: CommissioningCallOptions): Promise<InWorkspace<Native.CommissioningCandidates<'customers'>>>;
  candidates<V extends Native.CommissioningCandidateView>(args: Native.CommissioningCandidateQuery<V> & {view: V}, options?: CommissioningCallOptions): Promise<InWorkspace<Native.CommissioningCandidates<V>>>;
  candidates(args: Native.CommissioningCandidateQuery, options?: CommissioningCallOptions): Promise<InWorkspace<Native.CommissioningCandidates>>;
  preview(args: PreviewCommissioningArguments, options?: CommissioningCallOptions): Promise<InWorkspace<Native.CommissioningPreview>>;
  capture(args: CaptureCommissioningArguments, options?: CommissioningCallOptions): Promise<InWorkspace<Native.CommissioningCaptureMutationResult>>;
  captures(args?: Native.CommissioningCapturesQuery, options?: CommissioningCallOptions): Promise<InWorkspace<Native.CommissioningPage<Native.CommissioningCaptureSummary>>>;
  detail(args: CaptureSelector, options?: CommissioningCallOptions): Promise<AccountingCommissioningCaptureDetail>;
  export(args: CaptureSelector, options?: CommissioningCallOptions): Promise<AccountingCommissioningExport>;
  request(args: RequestSelector, options?: CommissioningCallOptions): Promise<InWorkspace<Native.CommissioningRequestResult>>;
  listAll<K extends AccountingCommissioningPagedOperation>(
    kind: K, args?: Omit<AccountingCommissioningArgumentsMap[K], 'offset' | 'limit'>,
    options?: CommissioningCallOptions,
  ): Promise<Omit<AccountingCommissioningResultMap[K], 'offset' | 'limit'>>;
  reconcileOperation<K extends AccountingCommissioningMutation>(
    kind: K, args: AccountingCommissioningArgumentsMap[K], options?: CommissioningCallOptions,
  ): Promise<InWorkspace<Native.CommissioningRequestResult>>;
  registerFileRead(readId: string): {workspace: string; readId: string};
  releaseFile(readId: string, options?: CommissioningCallOptions): Promise<WorkspaceReply>;
  drainFileReads(): Promise<WorkspaceReply>;
  fileChunks(selection: CommissioningFileSelection, options?: CommissioningFileReadOptions): AsyncGenerator<CommissioningFileChunk>;
  fileBytes(selection: CommissioningFileSelection, options?: CommissioningCompleteFileOptions): Promise<{bytes: Uint8Array; file: CommissioningFileIdentity}>;
  /** Release this caller’s retained reads; original accounting owner remains open. A failed drain can be retried. */
  disconnect(): Promise<WorkspaceReply>;
  /** Drain this caller’s reads and explicitly close the original accounting owner. */
  closeWorkspace(options?: CommissioningCallOptions): Promise<WorkspaceReply>;
}
export interface ConnectedAccountingCommissioningClient extends AccountingCommissioningClient {readonly endpoint: string}
export const ACCOUNTING_COMMISSIONING_METHODS: Readonly<{
  inspectSource: 'source_inspect'; importSource: 'source_import'; sources: 'source_list'; source: 'source_detail';
  candidates: 'candidates'; preview: 'preview'; capture: 'capture'; captures: 'capture_list'; detail: 'capture_detail';
  export: 'capture_export'; request: 'request_lookup';
}>;
export const ACCOUNTING_COMMISSIONING_MUTATIONS: readonly AccountingCommissioningMutation[];
export function accountingCommissioningArguments<K extends AccountingCommissioningMutation>(
  kind: K, value: AccountingCommissioningArgumentsMap[K],
): AccountingCommissioningArgumentsMap[K];
export function accountingCommissioningInspection<T extends AccountingCommissioningInspection>(value: T): T;
export function accountingCommissioningImportArguments(
  inspection: AccountingCommissioningInspection, operation: CommissioningImportIdentity,
): Native.ImportCommissioningSource;
export function accountingCommissioningPreview<T extends Native.CommissioningPreview>(value: T): T;
export function accountingCommissioningCaptureArguments(
  preview: Native.CommissioningPreview, operation: CommissioningOperationIdentity,
): CaptureCommissioningArguments;
export function createAccountingCommissioningClient(options: AccountingCommissioningClientOptions): AccountingCommissioningClient;
export function connectAccountingCommissioningClient(options: AccountingCommissioningConnectionOptions): Promise<ConnectedAccountingCommissioningClient>;
