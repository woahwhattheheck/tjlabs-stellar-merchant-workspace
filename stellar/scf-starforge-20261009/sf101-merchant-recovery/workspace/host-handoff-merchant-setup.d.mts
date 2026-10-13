/** MIT. Source-bound setup and explicit continuation of the original host. */
export interface HostHandoffSetupOptions {
  directory: string;
  connection: string;
  name?: string;
  operation?: 'initialize' | 'inspect' | 'resume';
}
export interface HostHandoffSetupResult {
  schema: 'stellar-forge.merchant-mcp.v1';
  configuration: string;
  state: 'INITIALIZED';
  hostHandoffsConfigured: true;
  ownership: 'ORIGINAL_WHOLE_HOST_HANDOFF';
  hosts: Array<{host: string; label: string; source: boolean; receiving: boolean}>;
  reused: boolean;
  setup: {controlDirectory: string; intentSha256: string; status: 'COMPLETE'};
}
export interface HostHandoffSetupInspection {
  schema: 'stellar-forge.recovery-host-setup.v1';
  directory: string;
  controlDirectory: string;
  status: 'NOT_STARTED' | 'BEFORE_INTENT' | 'INCOMPLETE' | 'COMPLETE' |
    'UNMANAGED_EXISTING_DIRECTORY' | 'UNBOUND_EXISTING_DIRECTORY';
  recordedOnly: true;
  intent?: {path: string; bytes: number; sha256: string; value: Record<string, unknown>};
  rootPresent?: boolean;
  rootRecorded?: boolean;
  rootStage?: string | null;
  configuration?: {bytes: number; sha256: string; matchesIntent: boolean} | null;
  result?: Omit<HostHandoffSetupResult, 'reused' | 'setup'> | null;
}
export declare function initializeHostHandoffMerchant(options: HostHandoffSetupOptions & {operation: 'inspect'}): Promise<HostHandoffSetupInspection>;
export declare function initializeHostHandoffMerchant(options: HostHandoffSetupOptions & {operation?: 'initialize' | 'resume'}): Promise<HostHandoffSetupResult>;
