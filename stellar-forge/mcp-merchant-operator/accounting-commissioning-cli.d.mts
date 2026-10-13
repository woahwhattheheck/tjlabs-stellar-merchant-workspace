import type {
  AccountingCommissioningClient, AccountingCommissioningMutation, AccountingCommissioningArgumentsMap,
  AccountingCommissioningInspection, CommissioningFileSelection, CommissioningFileIdentity,
} from './accounting-commissioning-client.mjs';
import type {CommissioningPreview, CommissioningRequestResult}
  from '../../stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/commissioning-collections/client.mjs';
export interface CommissioningPreparedConnection {
  directory: string; url: string; workspace: string; tokenEnv?: string;
}
export type PrepareAccountingCommissioningOperation = CommissioningPreparedConnection & (
  {kind: 'source_import'; arguments: AccountingCommissioningArgumentsMap['source_import']; preview?: never; actor?: never; requestId?: never} |
  {kind: 'capture'; arguments: AccountingCommissioningArgumentsMap['capture']; preview?: never; actor?: never; requestId?: never} |
  {kind: 'source_import'; preview: AccountingCommissioningInspection; actor: string; requestId?: string; arguments?: never} |
  {kind: 'capture'; preview: CommissioningPreview; actor: string; requestId?: string; arguments?: never}
);
export interface CommissioningPreparedOperation {
  directory: string; kind: AccountingCommissioningMutation; requestSha256: string;
  arguments: AccountingCommissioningArgumentsMap[AccountingCommissioningMutation]; phase: 'PREPARED';
}
export interface RunAccountingCommissioningOperation {
  directory: string; execute?: boolean; client?: AccountingCommissioningClient;
  environment?: Record<string, string | undefined>; signal?: AbortSignal;
}
export type AccountingCommissioningOperationResult =
  {directory: string; kind: AccountingCommissioningMutation; found: false; previouslyAttempted: boolean; observation: CommissioningRequestResult} |
  (CommissioningRequestResult & {directory: string; kind: AccountingCommissioningMutation; submitted: boolean; acknowledged: boolean});
export interface DownloadAccountingCommissioningFile {
  client: AccountingCommissioningClient; selection: CommissioningFileSelection; output: string;
  expectedSha256?: string; chunkBytes?: number; maximumBytes?: number; signal?: AbortSignal;
}
export interface DownloadedCommissioningFile {
  output: string; workspace: string; selection: CommissioningFileSelection; file: CommissioningFileIdentity; complete: true;
}
export function prepareAccountingCommissioningOperation(value: PrepareAccountingCommissioningOperation): Promise<CommissioningPreparedOperation>;
export function runAccountingCommissioningOperation(value: RunAccountingCommissioningOperation): Promise<AccountingCommissioningOperationResult>;
export function downloadAccountingCommissioningFile(value: DownloadAccountingCommissioningFile): Promise<DownloadedCommissioningFile>;
/** All eleven original operations plus open/close/configured-sources, prepare/execute/reconcile and download. */
export function main(args?: string[]): Promise<unknown>;
