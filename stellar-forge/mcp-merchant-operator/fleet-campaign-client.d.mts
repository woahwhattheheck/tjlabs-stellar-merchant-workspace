/// <reference types="node" />
export const FLEET_CAMPAIGN_TOOL_PREFIX: 'merchant_fleet_campaign_';

export type CampaignState = 'READY' | 'PENDING' | 'COMPLETE' | 'ROLLED_BACK';
export type CampaignAction = 'save' | 'advance' | 'pause' | 'rollback' | 'retire';
export type RequestPhase = 'PENDING' | 'COMPLETE';
export type RestoreMode = 'NATIVE_HISTORY' | 'RETAINED_RELEASES';
export type NativeRelationship = 'CURRENT' | 'FLEET_CHANGED' | 'COMMITTED_REQUEST_AVAILABLE';
export interface CallOptions {
  /** Passed to the existing connection. Cancellation is not a negative commit receipt. */
  requestSignal?: AbortSignal;
  timeoutMs?: number;
}
export type StructuredCall = (
  name: string, args: Record<string, unknown>, options?: CallOptions
) => unknown | Promise<unknown>;
export type Managed<T> = T & { managerId: string };

export interface NativeIdentity {
  revision: number;
  digest: string;
  snapshotId: string;
}
export interface ReleaseSelection {
  tenant: string;
  slot: string;
  releaseId: string;
}
export interface PinnedRelease extends ReleaseSelection {
  releaseDigest: string;
  /** Original retained source, payment and release metadata are preserved. */
  [key: string]: unknown;
}
export interface NativeSelection extends NativeIdentity {
  mapping: PinnedRelease[];
}
export interface WaveInput {
  id: string;
  label?: string;
  targets: ReleaseSelection[];
}
export interface SavedWave {
  id: string;
  label: string;
  targets: PinnedRelease[];
  before: PinnedRelease[];
  after: PinnedRelease[];
}
export interface SelectCampaign { id: string }
export interface SaveCampaign extends SelectCampaign {
  title: string;
  waves: WaveInput[];
  requestId: string;
  /** Omit or use null for first save. Existing unstarted plans require the observed revision. */
  expectedRevision?: number | null;
}
export interface ReviewWave extends SelectCampaign { expectedRevision: number }
export interface ApprovedRequest extends ReviewWave {
  requestId: string;
  reviewId: string;
}
export interface PauseCampaign extends SelectCampaign {
  expectedControlRevision: number;
  requestId: string;
  paused: boolean;
  /** An explicit empty string is valid and is preserved in the request hash. */
  reason?: string;
}
export interface ReviewRollback extends ReviewWave {
  /** Omit to select the original baseline; the review returns the actual selected target. */
  targetRevision?: number;
}
export interface RetireCampaign extends ReviewWave {
  requestId: string;
  tenant: string;
  slot: string;
  instanceId: string;
  expectedNativeRevision: number;
}
export interface CampaignInputs {
  save: SaveCampaign;
  advance: ApprovedRequest;
  pause: PauseCampaign;
  rollback: ApprovedRequest;
  retire: RetireCampaign;
}
export type OriginalRequest = CampaignInputs[CampaignAction];

export interface CampaignSummary {
  id: string;
  title: string;
  revision: number;
  /** Digest of the original fleet release plan, not the saved campaign document. */
  planDigest: string;
  state: CampaignState;
  nextWave: number;
  totalWaves: number;
  native: NativeIdentity;
  paused: boolean;
  controlRevision: number;
  pauseReason: string;
  pendingRequest: string | null;
  updatedAt: string;
}
export interface CampaignMutationResult extends CampaignSummary {
  requestId: string;
  /** The accepted request waits at an original continuation boundary. */
  awaiting?: 'CONTINUE_APPROVED_REQUEST';
  native: NativeIdentity & Record<string, unknown>;
  retiredInstanceId?: string;
  [key: string]: unknown;
}
export interface PauseResult {
  id: string;
  paused: boolean;
  controlRevision: number;
  reason: string;
  pendingRequest: string | null;
}
export interface CampaignRequest {
  id: string;
  kind: 'save' | 'wave' | 'rollback' | 'retire';
  requestSha256: string;
  request: SaveCampaign | ApprovedRequest | RetireCampaign;
  phase: RequestPhase;
  createdAt: string;
  finishedAt?: string;
  result?: CampaignMutationResult;
  target?: Record<string, unknown>;
  [key: string]: unknown;
}
export interface ControlRequest {
  id: string;
  requestSha256: string;
  at: string;
  result: PauseResult;
}
export interface CampaignControl {
  schema: 'stellar-forge.fleet-campaign-control.v1';
  id: string;
  planDigest: string;
  revision: number;
  paused: boolean;
  reason: string;
  updatedAt: string | null;
  requests: ControlRequest[];
}
export interface CampaignHistory {
  sequence: number;
  at: string;
  kind: string;
  requestId?: string;
  before?: NativeSelection;
  after?: PinnedRelease[];
  native?: NativeIdentity;
  [key: string]: unknown;
}
export interface PendingCampaign {
  kind: 'wave' | 'rollback';
  requestId: string;
  phase: string;
  before: NativeSelection;
  after: PinnedRelease[];
  waveIndex?: number;
  approval?: {
    reviewId: string;
    reviewedAt: string;
    comparisonSha256: string;
    comparisons: unknown[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}
export interface CampaignPlan {
  schema: 'stellar-forge.fleet-campaign.v1';
  id: string;
  planDigest: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  title: string;
  baseline: NativeSelection;
  expected: NativeSelection;
  waves: SavedWave[];
  nextWave: number;
  state: CampaignState;
  pending: PendingCampaign | null;
  requests: CampaignRequest[];
  history: CampaignHistory[];
}
export interface Retirement extends PinnedRelease {
  instanceId: string | null;
  owned: boolean;
  serving: boolean;
  candidate: boolean;
  drainingRequests: number;
  canRetire: boolean;
}
export interface RollbackBlocker {
  tenant: string;
  slot: string;
  code: string;
  serving: boolean;
  candidate: boolean;
  drainingRequests: number;
  canRetire: boolean;
  runningReleaseId: string | null;
}
export interface RollbackTarget extends NativeSelection {
  mode: RestoreMode;
  availability: 'SLOT_IN_USE' | 'REVIEW_REQUIRED';
  blockers: RollbackBlocker[];
}
export interface CampaignInspection extends Omit<CampaignSummary, 'pendingRequest'> {
  plan: CampaignPlan;
  control: CampaignControl;
  observed: NativeIdentity;
  relationship: NativeRelationship;
  retirements: Retirement[];
  rollbackTargets: RollbackTarget[];
  /** The complete accepted input, including its original requestId, revision and reviewId. */
  pendingRequest: OriginalRequest | null;
}
export interface WaveReview {
  id: string;
  kind: 'wave';
  revision: number;
  waveIndex: number;
  waveId: string;
  label: string;
  before: NativeSelection;
  after: PinnedRelease[];
  comparisons: unknown[];
  atomicMerchants: number;
  nativeReviewId: string;
  reviewId: string;
  expiresAt: string;
}
export interface RollbackReview {
  id: string;
  kind: 'rollback';
  revision: number;
  /** Actual current mapping, including changes outside the saved campaign. */
  before: NativeSelection;
  after: PinnedRelease[];
  targetRevision: number;
  digest?: string;
  restoreMode: RestoreMode;
  comparisons: unknown[];
  reviewId: string;
  expiresAt: string;
  [key: string]: unknown;
}
export interface CampaignList {
  schema: 'stellar-forge.fleet-campaign-list.v1';
  planDigest: string;
  campaigns: CampaignSummary[];
}
export interface CampaignExport {
  schema: 'stellar-forge.fleet-campaign-export.v1';
  planDigest: string;
  plan: CampaignPlan;
  control: CampaignControl;
  /** Canonical SHA-256 of {schema,planDigest,plan,control}; excludes managerId and file formatting. */
  sha256: string;
  managerId?: string;
}
export interface FleetPlanView {
  schema: string;
  digest: string;
  gateway: Record<string, unknown>;
  tenants: Array<{
    id: string; host: string; startupSlot: string;
    slots: Array<{ name: string; port: number }>;
    packages: string[];
    packageSources: unknown;
    limits: unknown;
    [key: string]: unknown;
  }>;
}
export interface FleetStatus {
  schema: 'stellar-forge.merchant-fleet-mcp.v1';
  configured: boolean;
  managerId: string | null;
  running: boolean;
  closing: boolean;
  lastOperation: Record<string, unknown> | null;
  planDigest: string | null;
  fleet: Record<string, unknown> | null;
}
export interface ReconciledObservation {
  revision: number;
  controlRevision: number;
  native: NativeIdentity;
  relationship: NativeRelationship;
  paused: boolean;
}
export interface ReconciliationBase<A extends CampaignAction> {
  id: string;
  action: A;
  requestId: string;
  requestSha256: string;
  request: CampaignInputs[A];
  managerId: string;
  planDigest: string;
  /** Absent only when an uncertain first save is absent from the original complete list. */
  observed?: ReconciledObservation;
}
export type RequestFor<A extends CampaignAction> = A extends 'pause' ? ControlRequest : CampaignRequest;
export type ResultFor<A extends CampaignAction> = A extends 'pause' ? PauseResult : CampaignMutationResult;
export type Reconciliation<A extends CampaignAction = CampaignAction> =
  | (ReconciliationBase<A> & { status: 'NOT_FOUND' })
  | (ReconciliationBase<A> & {
      status: 'PENDING';
      operation: CampaignRequest;
      pendingRequest: OriginalRequest | null;
    })
  | (ReconciliationBase<A> & {
      status: 'COMMITTED';
      operation: RequestFor<A>;
      /** Exact historical result. A later inspection may have newer plan/control revisions. */
      result: ResultFor<A>;
      pendingRequest?: OriginalRequest | null;
    });

export interface FleetCampaignClient {
  readonly expectedPlanDigest?: string;
  readonly expectedManagerId?: string;
  plan(options?: CallOptions): Promise<FleetPlanView>;
  status(options?: CallOptions): Promise<FleetStatus>;
  list(options?: CallOptions): Promise<Managed<CampaignList>>;
  inspect(input: SelectCampaign, options?: CallOptions): Promise<Managed<CampaignInspection>>;
  save(input: SaveCampaign, options?: CallOptions): Promise<Managed<CampaignMutationResult>>;
  review(input: ReviewWave, options?: CallOptions): Promise<Managed<WaveReview>>;
  advance(input: ApprovedRequest, options?: CallOptions): Promise<Managed<CampaignMutationResult>>;
  pause(input: PauseCampaign, options?: CallOptions): Promise<Managed<PauseResult>>;
  rollbackReview(input: ReviewRollback, options?: CallOptions): Promise<Managed<RollbackReview>>;
  rollback(input: ApprovedRequest, options?: CallOptions): Promise<Managed<CampaignMutationResult>>;
  retire(input: RetireCampaign, options?: CallOptions): Promise<Managed<CampaignMutationResult>>;
  export(input: SelectCampaign, options?: CallOptions): Promise<Managed<CampaignExport>>;
  /** Read-only journal reconciliation. It never replays, unpauses or signs another request. */
  reconcile<A extends CampaignAction>(
    action: A, input: CampaignInputs[A], options?: CallOptions
  ): Promise<Reconciliation<A>>;
  /** Drain this caller's accepted calls. The shared fleet and connection remain owned by their original caller. */
  disconnect(): Promise<{ disconnected: true }>;
}
export interface FleetCampaignClientOptions {
  call: StructuredCall;
  /** Optional pre-dispatch owner observation and returned-digest check. Not an additional native lease. */
  expectedPlanDigest?: string;
  /** Recreate the client with a deliberately inspected new owner after original fleet restart. */
  expectedManagerId?: string;
}
export function createFleetCampaignClient(options: FleetCampaignClientOptions): FleetCampaignClient;
/** The original canonical JSON request hash. Does not trim strings or generate an ID. */
export function fleetCampaignRequestSha256(input: OriginalRequest | Record<string, unknown>): string;
/** Validate the original document checksum and plan/control identity, preserving all captured fields. */
export function verifyFleetCampaignExport<T extends CampaignExport = CampaignExport>(document: T): T;
