import type { DownloadSelection, MerchantPlan, OperationSelection, OperationState,
  ProfileId, ProviderRecovery, Recovery, RequestId, SimulationRequest }
  from '../../stellar/scf-starforge-20261009/partners/tenderly-stellar-pilot/workspace/connection.mjs';

export const TENDERLY_WORKSPACE_CONNECTION_SCHEMA: 'stellar-forge.tenderly-workspace-connection.v1';
export type TenderlyWorkspaceInput =
  | { label?: string; directory: string; mode: 'managed'; plan?: never; facilitator?: never }
  | { label?: string; directory: string; mode?: 'owned'; plan?: string; facilitator?: string };
export interface TenderlyWorkspaceConfiguration {
  schema: typeof TENDERLY_WORKSPACE_CONNECTION_SCHEMA;
  workspaces: Record<string, { label: string; directory: string; planPath?: string;
    merchantOptions: { facilitator?: string }; mode: 'owned' | 'managed';
    workspaceId: string | null; workspaceSha256: string | null }>;
}
export function readTenderlyWorkspaceConfiguration(path: string): Promise<TenderlyWorkspaceConfiguration>;
type Selected = { workspace: string };
type InProfile = Selected & { profile: ProfileId };
type InOperation = Selected & OperationSelection;
export interface TenderlyToolArguments {
  merchant_tenderly_workspaces: Record<string, never>;
  merchant_tenderly_open: Selected;
  merchant_tenderly_close: Selected & { instanceId: string };
  merchant_tenderly_status: Selected;
  merchant_tenderly_profile_preview: Selected & { plan?: MerchantPlan };
  merchant_tenderly_profile_save: Selected & { plan: MerchantPlan; label?: string };
  merchant_tenderly_profiles: Selected & { before?: ProfileId; limit?: number };
  merchant_tenderly_profile: InProfile;
  merchant_tenderly_prepare: InProfile;
  merchant_tenderly_profile_open: InProfile;
  merchant_tenderly_start: InProfile;
  merchant_tenderly_stop: InProfile;
  merchant_tenderly_issue: InProfile & { body: SimulationRequest; id: string; subject: string; expiresAt: number };
  merchant_tenderly_requests: InProfile & { before?: RequestId; limit?: number };
  merchant_tenderly_request: InProfile & { requestId: RequestId };
  merchant_tenderly_operations: InProfile & { state?: OperationState; cursor?: string; limit?: number };
  merchant_tenderly_operation: InOperation;
  merchant_tenderly_audit: InOperation & { after?: number; limit?: number };
  merchant_tenderly_result: InOperation;
  merchant_tenderly_recover: Selected & Recovery;
  merchant_tenderly_provider_lookup: InOperation & { simulationId: string; refresh?: boolean };
  merchant_tenderly_provider_lookups: InOperation & { before?: string; limit?: number };
  merchant_tenderly_provider_inspect: InProfile & { lookupId: string };
  merchant_tenderly_provider_recover: Selected & ProviderRecovery;
  merchant_tenderly_file_read: Selected & DownloadSelection & {
    readId?: string; expectedSha256?: string; offset?: number; limit?: number };
  merchant_tenderly_file_release: Selected & { readId: string };
}
export type TenderlyToolName = keyof TenderlyToolArguments;
export interface TenderlyToolResult { [key: string]: unknown }
export class MerchantTenderlyWorkspaces {
  constructor(config: { tenderlyWorkspaces?: TenderlyWorkspaceConfiguration | null });
  get summary(): TenderlyToolResult;
  call<Name extends TenderlyToolName>(name: Name, args: TenderlyToolArguments[Name]): Promise<TenderlyToolResult>;
  call(name: 'merchant_tenderly_workspaces'): Promise<TenderlyToolResult>;
  close(): Promise<void>;
}
export function tenderlyWorkspaceTools<T>(tool: (
  name: TenderlyToolName, description: string, properties: Record<string, unknown>,
  required: string[], annotations: Record<string, boolean>
) => T): T[];
