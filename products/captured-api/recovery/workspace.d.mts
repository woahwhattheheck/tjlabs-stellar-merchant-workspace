/** Complete private operating recovery over the original SF101 and Captured API owners. */
export type Sha256 = string;
export type AbsolutePath = string;
export interface RecoveryEnvironment { environment?: Record<string, string | undefined>; }
export interface CapturedRecoverySelection {
  schema: 'stellar-forge.captured-api-recovery-selection.v1';
  directory: AbsolutePath;
  /** Additional original provider workspaces or files selected by the operator. */
  additionalRoots?: Array<{ name: string; path: AbsolutePath }>;
  /** Complete original product package archive, retained as an encrypted logical root. */
  sourceArchive?: AbsolutePath;
}
export interface CapturedRecoveryTargets {
  schema: 'stellar-forge.captured-api-recovery-targets.v1';
  sourcePlanSha256: Sha256;
  destinationParents: AbsolutePath[];
}
export interface CapturedProductProfile {
  schema: 'stellar-forge.captured-api-product.v1';
  name: string;
  directory: AbsolutePath;
  configuration: AbsolutePath;
  operatorDirectory: AbsolutePath;
  harConnection: AbsolutePath;
  openapiConnection: AbsolutePath;
  inputsDirectory: AbsolutePath;
  receivingDirectory: AbsolutePath;
  projectsDirectory: AbsolutePath;
  console: { ownership: 'PRODUCT' | 'EXTERNAL'; urlFile: AbsolutePath };
  oauthConnectionsFile: AbsolutePath | null;
}
export interface RecoveryTree {
  kind: 'file' | 'directory';
  sha256: Sha256;
  files: number;
  directories: number;
  bytes: number;
}
export interface RecoveryRoot {
  name: string;
  path: AbsolutePath;
  kind: 'file' | 'directory';
}
export interface RecoveryReference {
  role: string;
  path: AbsolutePath;
  present: boolean;
  kind: 'file' | 'directory' | null;
  root: string | null;
}
export interface RecoveryOAuthStore {
  alias: string;
  directoryEnv: string;
  directory: AbsolutePath;
  grantId: string | null;
  grantGeneration: number;
  profileSha256: Sha256;
  revision: number;
  grantState: string | null;
  clientSecretEnv: string | null;
}
export interface RecoveryRelease {
  directory: AbsolutePath;
  generation: number;
  active: unknown;
  previous: unknown;
  retainedChanges: number;
  stateSha256: Sha256;
}
export interface RecoveryRuntime {
  node: AbsolutePath;
  nodeVersion: string;
  platform: string;
  architecture: string;
  sourceDirectory: AbsolutePath;
  files: Array<{ name: string; bytes: number; sha256: Sha256 }>;
  sourceArchive: AbsolutePath | null;
}
export interface RecoverySummary {
  product: { name: string; directory: AbsolutePath; projectsDirectory: AbsolutePath; consoleOwnership: 'PRODUCT' | 'EXTERNAL' };
  release: RecoveryRelease;
  oauth: RecoveryOAuthStore[];
  environmentFiles: Array<{ name: string; path: AbsolutePath }>;
  references: RecoveryReference[];
  configurationSha256: Sha256;
}
export interface CapturedRecoverySource {
  schema: 'stellar-forge.captured-api-recovery-profile.v1';
  product: CapturedProductProfile;
  selection: CapturedRecoverySelection;
  selectionFile: { path: AbsolutePath; bytes: number; sha256: Sha256 } | null;
  owner: { uid: number; gid: number };
  roots: RecoveryRoot[];
  summary: RecoverySummary;
  runtime: RecoveryRuntime;
  source: { trees: Record<string, RecoveryTree>; files: number; directories: number; bytes: number };
}
export interface CapturedRecoveryProfile extends CapturedRecoverySource {
  createdAt: string;
  planFile: AbsolutePath;
}
export interface CapturedRecoveryPlanResult {
  status: 'CAPTURED_RECOVERY_PLAN_READY';
  planFile: AbsolutePath;
  planSha256: Sha256;
  profileSha256: Sha256;
  reused: boolean;
  profile: CapturedRecoveryProfile;
}
export interface CapturedRecoverySourceMatch {
  status: 'CAPTURED_RECOVERY_SOURCE_MATCHED';
  planFile: AbsolutePath;
  planSha256: Sha256;
  profileSha256: Sha256;
  profile: CapturedRecoveryProfile;
}
export interface RecoveryCaptureResult {
  status: 'CAPTURED_RECOVERY_CAPTURED';
  bundleDirectory: AbsolutePath;
  operationDirectory: AbsolutePath;
  snapshotSha256: Sha256;
  planSha256: Sha256;
  profileSha256: Sha256;
  captureId: Sha256;
  product: CapturedProductProfile;
  summary: RecoverySummary;
  runtime: RecoveryRuntime;
  files: number;
  bytes: number;
  completedAt: string;
  original: Record<string, unknown>;
}
export interface RecoveryVerificationResult {
  status: 'CAPTURED_RECOVERY_VERIFIED';
  bundleDirectory: AbsolutePath;
  snapshotSha256: Sha256;
  planSha256: Sha256;
  captureId: Sha256;
  files: number;
  bytes: number;
  original: Record<string, unknown>;
}
export interface RecoveryRestoreResult {
  status: 'CAPTURED_RECOVERY_RESTORED';
  operationDirectory: AbsolutePath;
  restoreDirectory: AbsolutePath;
  snapshotSha256: Sha256;
  planSha256: Sha256;
  profileSha256: Sha256;
  captureId: Sha256;
  product: CapturedProductProfile;
  summary: RecoverySummary;
  runtime: RecoveryRuntime;
  files: number;
  bytes: number;
  completedAt: string;
  original: { restore: unknown; reused: boolean };
}
export interface CapturedRecoveryReview {
  schema: 'stellar-forge.captured-api-recovery-receiving.v1';
  snapshotSha256: Sha256;
  sourcePlanSha256: Sha256;
  profileSha256: Sha256;
  restoreOperation: AbsolutePath;
  restoreDirectory: AbsolutePath;
  targetFile: AbsolutePath;
  targetSha256: Sha256;
  operationDirectory: AbsolutePath;
  destinationParents: Array<{ directory: AbsolutePath; device: string; inode: string }>;
  owner: { uid: number; gid: number };
  product: CapturedProductProfile;
  roots: Array<RecoveryRoot & { destination: AbsolutePath; restored: AbsolutePath; source: RecoveryTree }>;
  environmentFiles: Array<{ name: string; path: AbsolutePath }>;
  directoryEnvironment: Array<{ name: string; directory: AbsolutePath }>;
  runtime: RecoveryRuntime;
}
export interface CapturedRecoveredFileIdentity {
  device: string;
  inode: string;
  bytes: number;
  mtimeNs: string;
  ctimeNs: string;
}
export interface CapturedRecoveredFileBinding {
  /** Logical native snapshot root. */
  root: string;
  /** Root-relative immutable sidecar path. */
  name: string;
  kind: 'archive' | 'upload';
  /** Root-relative original archive or upload payload. */
  file: string;
  bytes: number;
  sha256: Sha256;
  identity: CapturedRecoveredFileIdentity;
  complete: boolean;
  sidecarSha256: Sha256;
  /** Exact immutable original records, with root-relative paths. */
  records: Array<{ name: string; bytes: number; sha256: Sha256 }>;
}
export interface CapturedRecoveryReceivingResult {
  status: 'CAPTURED_RECOVERY_RECEIVED';
  operationId: Sha256;
  operationDirectory: AbsolutePath;
  reviewSha256: Sha256;
  snapshotSha256: Sha256;
  sourcePlanSha256: Sha256;
  profileSha256: Sha256;
  product: CapturedProductProfile;
  summary: RecoverySummary;
  runtime: RecoveryRuntime;
  roots: Array<RecoveryRoot & { source: RecoveryTree }>;
  recoveryBindings: CapturedRecoveredFileBinding[];
  directoryEnvironment: Array<{ name: string; directory: AbsolutePath }>;
  environmentFiles: Array<{ name: string; path: AbsolutePath }>;
  reopen: { command: 'starforge'; argv: string[] };
  completedAt: string;
}
export interface CapturedRestoreInspection {
  status: 'CAPTURED_RECOVERY_RESTORE_INSPECTED';
  snapshotSha256: Sha256;
  sourcePlanSha256: Sha256;
  profileSha256: Sha256;
  product: CapturedProductProfile;
  summary: RecoverySummary;
  source: CapturedRecoverySource['source'];
  runtime: RecoveryRuntime;
  targets: RecoveryRoot[];
}
export interface CapturedReceivingInspection {
  status: 'CAPTURED_RECOVERY_RECEIVING_REVIEW' | 'CAPTURED_RECOVERY_RECEIVING_COMPLETE';
  review: CapturedRecoveryReview;
  reviewSha256: Sha256;
  availability: Array<{ name: string; path: AbsolutePath; state: string }>;
  summary: RecoverySummary;
  operation: null | { phase: string; error: RecoveryError | null; result: CapturedRecoveryReceivingResult | null };
}
export interface RecoveryError { code: string; message: string; at: string; }
export interface CapturedRecoveryStatus {
  schema: 'stellar-forge.captured-api-recovery-operation.v1';
  kind: 'CAPTURE' | 'RESTORE' | 'RECEIVE';
  operationDirectory: AbsolutePath;
  input: Record<string, string>;
  inputSha256: Sha256;
  createdAt: string;
  updatedAt: string | null;
  phase: string;
  progress: string | null;
  retainedCaptures: unknown[];
  retainedRestores: Array<{ path: AbsolutePath; retainedAt: string }>;
  error: RecoveryError | null;
  result: RecoveryCaptureResult | RecoveryRestoreResult | CapturedRecoveryReceivingResult | null;
}
export const SELECTION_SCHEMA: 'stellar-forge.captured-api-recovery-selection.v1';
export const PROFILE_SCHEMA: 'stellar-forge.captured-api-recovery-profile.v1';
export const TARGET_SCHEMA: 'stellar-forge.captured-api-recovery-targets.v1';
export const RECEIVING_SCHEMA: 'stellar-forge.captured-api-recovery-receiving.v1';

export function inspectCapturedRecovery(input: {
  directory?: AbsolutePath; selectionFile?: AbsolutePath;
}, options?: RecoveryEnvironment): Promise<CapturedRecoverySource>;
export function prepareCapturedRecoveryPlan(input: {
  directory?: AbsolutePath; selectionFile?: AbsolutePath; planFile: AbsolutePath; quiesced: boolean;
}, options?: RecoveryEnvironment): Promise<CapturedRecoveryPlanResult>;
export function inspectCapturedRecoveryPlan(planFile: AbsolutePath, options?: RecoveryEnvironment): Promise<CapturedRecoverySourceMatch>;
export function captureCapturedRecovery(input: {
  planFile: AbsolutePath; bundleDirectory: AbsolutePath; operationDirectory: AbsolutePath;
  passphraseEnv: string; expectedPlanSha256: Sha256; quiesced?: boolean;
}, options?: RecoveryEnvironment): Promise<RecoveryCaptureResult>;
export function verifyCapturedRecovery(input: {
  bundleDirectory: AbsolutePath; passphraseEnv: string; expectedManifestSha256?: Sha256;
}): Promise<RecoveryVerificationResult>;
export function restoreCapturedRecovery(input: {
  bundleDirectory: AbsolutePath; operationDirectory: AbsolutePath; passphraseEnv: string; expectedManifestSha256: Sha256;
}): Promise<RecoveryRestoreResult>;
export function reviewRecoveredCapturedApi(input: {
  restoreOperation: AbsolutePath;
}): Promise<CapturedRestoreInspection>;
export function reviewRecoveredCapturedApi(input: {
  restoreOperation: AbsolutePath; targetFile: AbsolutePath; operationDirectory: AbsolutePath;
}): Promise<CapturedReceivingInspection>;
export function receiveRecoveredCapturedApi(input: {
  restoreOperation: AbsolutePath; targetFile: AbsolutePath; operationDirectory: AbsolutePath;
  expectedReviewSha256: Sha256; quiesced?: boolean;
}): Promise<CapturedRecoveryReceivingResult>;
export function capturedRecoveryStatus(operationDirectory: AbsolutePath): Promise<CapturedRecoveryStatus>;
export function recoveredCapturedApiSelection(operationDirectory: AbsolutePath): Promise<{
  result: CapturedRecoveryReceivingResult; product: CapturedProductProfile;
}>;
/** Call only after complete authentication by the original SF101 engine. */
export function inspectCapturedRecoveryManifest(input: {
  planBytes: Uint8Array; manifest: Record<string, unknown>;
}): { schema: 'stellar-forge.captured-api-recovery-profile.v1'; planSha256: Sha256; profileSha256: Sha256;
  captureId: Sha256; product: CapturedProductProfile; summary: RecoverySummary };
