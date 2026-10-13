/** MIT. Host-only trusted configuration for the original offline handoff provider. */
import type { HostHandoffResult } from './host-handoff.mjs';

export declare const HOST_HANDOFF_CONNECTION_SCHEMA: 'stellar-forge.recovery-host-handoff-connection.v1';
export interface HostHandoffAliasBase {
  label: string;
  bundleDirectory: string;
  /** Name only. The secret remains in the native process environment. */
  passphraseEnv: string;
}
export interface HostHandoffSourceGroup {
  selectionFile: string;
  planFile: string;
  captureOperationDirectory: string;
}
export interface HostHandoffReceivingGroup {
  restoreDirectory: string;
  targetFile: string;
  adoptionOperationDirectory: string;
  /** Absolute trusted host executable; never a tool argument. */
  python?: string;
}
export type HostHandoffAlias = HostHandoffAliasBase & (
  (HostHandoffSourceGroup & Partial<HostHandoffReceivingGroup>) |
  (HostHandoffReceivingGroup & Partial<HostHandoffSourceGroup>)
);
/** If one member of an optional group is present, all group paths are required. */
export interface HostHandoffConnection {
  schema: typeof HOST_HANDOFF_CONNECTION_SCHEMA;
  hosts: Record<string, HostHandoffAlias>;
}
export interface HostHandoffOperatorCustody {
  operatorDirectory: string;
  releaseStore: string;
  exportsDirectory: string;
  /** Derived original setup controls; retained outside captured/receiving roots. */
  setupDirectory?: string;
}
export interface HostHandoffMerchantConfiguration extends HostHandoffConnection {
  connectionFile: string;
  connectionSha256: string;
  custody: HostHandoffOperatorCustody;
}
export declare function readHostHandoffMerchantConfiguration(
  filename: string, custody: HostHandoffOperatorCustody
): Promise<HostHandoffMerchantConfiguration>;
export declare function assertHostHandoffOperatorCustody(roots: string[], protectedPaths: string[]): void;

export interface HostHandoffToolArguments {
  merchant_host_handoff_hosts: Record<string, never>;
  merchant_host_handoff_selection: { host: string };
  merchant_host_handoff_plan: { host: string; expectedSelectionSha256: string; quiesced: true };
  merchant_host_handoff_saved_plan: { host: string; expectedPlanSha256?: string };
  merchant_host_handoff_export: { host: string; expectedPlanSha256: string; quiesced: true };
  merchant_host_handoff_capture: { host: string; expectedPlanSha256: string };
  merchant_host_handoff_restore: { host: string; expectedManifestSha256: string };
  merchant_host_handoff_review: { host: string; expectedManifestSha256: string };
  merchant_host_handoff_adopt: {
    host: string; expectedManifestSha256: string; expectedReviewSha256: string; quiesced: true;
  };
  merchant_host_handoff_operation: { host: string; expectedReviewSha256: string };
}
export interface HostHandoffProviderSummary {
  ownership: 'ORIGINAL_OFFLINE_HOST_HANDOFF';
  closing: boolean;
  active: null | {
    host: string; operation: string; startedAt: string;
    cancellation: 'ORIGINAL_ADOPTION_ABORT_AND_DRAIN' | 'DRAIN_ONLY';
  };
  hosts: Array<{ host: string; label: string; source: boolean; receiving: boolean }>;
}
export interface RecordedHostHandoff {
  schema: 'stellar-forge.recovery-host-handoff-recorded.v1';
  status: 'SOURCE_SELECTION' | 'RECORDED_PLAN' | 'RECORDED_CAPTURE';
  host: string; path: string; bytes: number; sha256: string; json: string;
  value: Record<string, unknown>;
  planSha256?: string; operationId?: string;
  validation: 'RECORDED_ONLY_NOT_FRESH_SOURCE_OR_NATIVE_VALIDATION';
}
export interface AbsentHostHandoff {
  status: 'ABSENT'; host: string; path: string;
  validation: 'RECORDED_ONLY_NOT_FRESH_SOURCE_OR_NATIVE_VALIDATION';
}
export type HostHandoffRecordedOperation = {
  schema: 'stellar-forge.host-adoption-operation.v1';
  validation: 'RECORDED_ONLY_NOT_FRESH_ROOT_VALIDATION';
  [key: string]: unknown;
} & ({
  /** An existing operation directory may precede its original binding record. */
  status: 'ABSENT'; reviewSha256?: string; result: null;
} | {
  status: 'PREPARED' | 'RECORDED_COMPLETE'; reviewSha256: string;
  result: null | Record<string, unknown>;
});
export interface HostHandoffToolResults {
  merchant_host_handoff_hosts: HostHandoffProviderSummary & {
    schema: typeof HOST_HANDOFF_CONNECTION_SCHEMA; connectionSha256: string;
  };
  merchant_host_handoff_selection: RecordedHostHandoff;
  merchant_host_handoff_plan: HostHandoffResult;
  merchant_host_handoff_saved_plan: RecordedHostHandoff | AbsentHostHandoff;
  merchant_host_handoff_export: HostHandoffResult;
  merchant_host_handoff_capture: RecordedHostHandoff | AbsentHostHandoff;
  merchant_host_handoff_restore: HostHandoffResult;
  merchant_host_handoff_review: HostHandoffResult;
  merchant_host_handoff_adopt: HostHandoffResult;
  merchant_host_handoff_operation: HostHandoffRecordedOperation;
}
export declare class MerchantHostHandoffs {
  /** Complete original Merchant configuration; no sources or other provider families. */
  constructor(config: {
    schema: string; name: string; sources: Record<string, never>;
    releaseStore: string; exportsDirectory: string; hostHandoffs: HostHandoffMerchantConfiguration;
  }, options?: { consoleDirectory?: string });
  get summary(): HostHandoffProviderSummary;
  call<K extends keyof HostHandoffToolArguments>(
    name: K, args: HostHandoffToolArguments[K]
  ): Promise<HostHandoffToolResults[K]>;
  /** Stops admission; aborts only native adoption, then drains all accepted calls. */
  close(): Promise<void>;
}
