/** Original BLS publisher and SF88 receiving within one analyst operation. */
export type BlsProjection = 'laus' | 'qcew' | 'source_files';
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export interface BlsNativeInput {
  source_sha256: string;
  projections: BlsProjection[];
  reviewer: string;
  note: string;
  existing?: Partial<Record<BlsProjection, { plan_id?: number; run_id?: string }>>;
  receive?: 'sources' | 'vitality';
  releases?: BlsProjection[];
}
export interface BlsNativeRequest {
  schema?: 'stellar-forge.bls-native-receiving-request.v1';
  id: string;
  input: BlsNativeInput;
}
export interface BlsNativeConnection {
  schema?: 'stellar-forge.bls-native-connection.v1';
  publishers?: Partial<Record<BlsProjection, {
    seller_file?: string;
    release_directory?: string;
    runtime?: { port?: number; facilitator?: string; allowLocalFacilitator?: boolean };
  }>>;
  customer?: {
    checkout: string;
    session: string;
    python: string;
    node?: string;
    delivery: string;
    sources: string;
    timeout?: number;
    continue_acquisition?: boolean;
    vitality?: {
      source: string;
      workspace: string;
      operator: string;
      catalog?: string;
      only?: string[];
    };
  };
}
export interface BlsNativeProjectionResult {
  projection: BlsProjection;
  plan_id: number;
  plan_digest: string;
  run_id: string;
  native_state: 'PUBLISHED';
  candidate_digest: string;
  snapshot: string;
  row_count: number;
  publication: { snapshot: string; revision: number; [key: string]: Json };
  publisher_path: string;
  target_path: string;
  complete: true;
  release?: {
    package_path: string;
    release_path: string;
    snapshot: string;
    files: Json[];
  };
  [key: string]: unknown;
}
export interface BlsNativeResult {
  schema: 'stellar-forge.bls-native-receiving.v1';
  operation_id: string;
  source_sha256: string;
  capture_id: string;
  complete: true;
  completed_at: string;
  runtime: { node: string; platform: string };
  projections: BlsNativeProjectionResult[];
  customer?: {
    schema: 'stellar-forge.bls-native-customer.v1';
    received: { capture_id: string; source_files: number; acquired_rows: number; [key: string]: Json };
    acquisition?: Json;
    vitality?: Json;
  };
  operation_path: string;
}
export declare const NATIVE_REQUEST_SCHEMA: 'stellar-forge.bls-native-receiving-request.v1';
export declare const NATIVE_RESULT_SCHEMA: 'stellar-forge.bls-native-receiving.v1';
export declare function validateNativeRequest(request: unknown): BlsNativeRequest;
export declare function continueBlsNativeReceiving(options: {
  directory: string;
  request: BlsNativeRequest;
  connectionFile?: string;
  signal?: AbortSignal;
  onProgress?: (progress: {
    operation_id: string;
    phase: string;
    projections: Partial<Record<BlsProjection, Record<string, unknown>>>;
  }) => void;
}): Promise<BlsNativeResult>;
export declare function main(argv?: string[]): Promise<BlsNativeResult>;
