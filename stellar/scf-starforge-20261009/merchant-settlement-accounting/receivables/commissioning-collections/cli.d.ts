import type {
  CommissioningInspection, CommissioningSourceSummary, CommissioningSourceResponse, CommissioningCandidates,
  CommissioningPage, CommissioningCaptureSummary, CommissioningCaptureResult, CommissioningCaptureMutationResult,
  CommissioningImportResult, CommissioningRequestResult, CommissioningPreview, CaptureCommissioningCollections,
  ImportCommissioningSource,
} from './client.mjs';

export interface CommissioningOperationBinding {
  expectedWorkspaceId?: string; expectedSourcesSha256?: string;
}
export type CommissioningPreparedOperation = {
  schema: 'stellar-forge.commissioning-operation.v1';
  requestSha256: string; preparedAt: string; binding: CommissioningOperationBinding;
  nativeAction: 'commissioning_source_imported' | 'commissioning_collections_captured'; nativeIntentSha256: string;
} & (
  {action: 'source-import'; sourceId: null; value: ImportCommissioningSource} |
  {action: 'capture'; sourceId: string; value: CaptureCommissioningCollections}
);
export interface CommissioningPrepareReceipt {
  path: string; schema: CommissioningPreparedOperation['schema'];
  action: CommissioningPreparedOperation['action']; sourceId: string | null;
  requestId: string; revision: number; requestSha256: string;
  nativeAction: CommissioningPreparedOperation['nativeAction']; nativeIntentSha256: string; bytes: number; sha256: string;
}
export interface CommissioningDownloadReceipt {
  path: string; name: string; type: string; bytes: number; sha256: string;
}
export interface CommissioningExportReceipt {
  path: string; format: 'directory' | 'tar' | 'json'; revision: number;
  files: Array<{name: string; type: string; bytes: number; sha256: string}>;
}
export interface CommissioningCliServer {
  url: string; port: number; workspace: {directory: string; state: Record<string, unknown>};
  close(): Promise<void>;
}
export type CommissioningCliResult =
  CommissioningInspection | CommissioningPage<CommissioningSourceSummary> | CommissioningSourceResponse |
  CommissioningCandidates | CommissioningPreview | CommissioningPage<CommissioningCaptureSummary> |
  CommissioningCaptureResult | CommissioningImportResult | CommissioningCaptureMutationResult |
  CommissioningRequestResult | CommissioningPrepareReceipt | CommissioningDownloadReceipt |
  CommissioningExportReceipt | CommissioningCliServer | void;
export function parseCommissioningCollectionsArguments(argv: string[]): {command: string; flags: Record<string, string>};
/** Runs one original command. execute submits once; reconcile only reads the original operation journal. */
export function runCommissioningCollectionsCli(argv?: string[]): Promise<CommissioningCliResult>;
