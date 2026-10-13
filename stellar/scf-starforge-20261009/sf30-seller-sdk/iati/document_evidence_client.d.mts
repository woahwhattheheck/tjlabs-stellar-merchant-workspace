import type { RequestOptions, RevisionOptions, Sha256 } from './client.mjs';
import type { DocumentOperatingSource } from './document_evidence/operating_procedure.mjs';

/** MIT. The native document-evidence engine owns validation, history and acquisition. */
export type DocumentEvidenceView = 'source' | 'candidate';
export type DocumentEvidenceFileKind = 'report' | 'register' | 'plan' | 'correction';
export type DocumentEvidenceState = 'DRAFT' | 'EVIDENCE_READY' | 'REVIEWED';
export type DocumentObservationState = 'COMPLETE' | 'TRUNCATED' | 'FAILED' | 'REFUSED' | 'INTERRUPTED';
export type DocumentObservationOutcome = 'HTTP_SUCCESS' | 'HTTP_ERROR' | 'INCOMPLETE' | 'UNREACHABLE' | 'REFUSED' | 'INTERRUPTED';

export interface DocumentEvidenceLimits {
  maxBytes: number;
  timeoutSeconds: number;
  connectTimeoutSeconds: number;
  maxRedirects: number;
}
export interface DocumentEvidenceSelectionInput {
  id: Sha256;
  revision: number;
  view: DocumentEvidenceView;
  expectedSnapshot: Sha256;
}
export interface DocumentEvidenceSelection extends DocumentEvidenceSelectionInput {
  recordSha256: Sha256;
  sourceId: Sha256;
  candidateSha256: Sha256;
  selectedSha256: Sha256;
  organisationKeys: Sha256[];
}
export interface DocumentEvidenceRowSource {
  [key: string]: unknown;
  id: Sha256;
  organisationKey: Sha256;
  /** Exact literal publisher URL; acquisition does not trim or replace it. */
  url: string;
  format?: string;
  titles?: Array<{ text: string; language?: string; [key: string]: unknown }>;
  descriptions?: unknown[];
  categories?: unknown[];
  languages?: unknown[];
  documentDate?: unknown;
  urlTarget: {
    [key: string]: unknown;
    id: Sha256;
    beforeSha256: Sha256;
    nodeSha256: Sha256;
    attribute: 'url';
    value: string;
    present: boolean;
  };
}
export interface DocumentBodyDescriptor {
  sha256: Sha256;
  bytes: number;
  name: string;
  media: string;
  /** Completion of the HTTP message body, including error or range responses. */
  complete: boolean;
  representation: 'http-message-body';
  contentEncoding: string | null;
}
export interface DocumentFetchReceipt {
  [key: string]: unknown;
  schema: 'iati-public-document-fetch/1';
  requestedUrl: string;
  finalUrl: string | null;
  startedAt: string;
  finishedAt: string;
  elapsedSeconds: number;
  state: string;
  status: number | null;
  /** Original response, DNS, connected-address, redirect and informational-response evidence. */
  hops: Array<Record<string, unknown>>;
  body: DocumentBodyDescriptor | null;
  error: unknown;
  limits: Record<string, unknown>;
}
export interface DocumentObservationSummary {
  id: Sha256;
  state: DocumentObservationState;
  outcome: DocumentObservationOutcome;
  status: number | null;
  finishedAt: string;
  body: DocumentBodyDescriptor | null;
  /** Native eligibility as a complete document; relevance still needs named review. */
  documentComplete: boolean;
}
export interface DocumentObservation {
  schema: 'stellar-forge.iati-document-observation.v1';
  id: Sha256;
  requestId: string;
  planId: Sha256;
  rowIds: Sha256[];
  publishedUrl: string;
  actor: string;
  startedAt: string;
  finishedAt: string;
  state: DocumentObservationState;
  outcome: DocumentObservationOutcome;
  documentComplete: boolean;
  /** Interrupted acquisitions retain their original request and may have a body prefix. */
  fetch: DocumentFetchReceipt | null;
  body: DocumentBodyDescriptor | null;
  recordSha256: Sha256;
}
export type DocumentEvidenceDecision = {
  rowId: Sha256;
  note: string;
} & (
  | { decision: 'usable'; observationId: Sha256; correctedUrl?: never }
  | { decision: 'needs_correction'; observationId: Sha256; correctedUrl?: string }
  | { decision: 'not_applicable' | 'deferred'; observationId: Sha256 | null; correctedUrl?: never }
);
export interface DocumentEvidenceReview {
  id: Sha256;
  actor: string;
  note: string;
  at: string;
  decisions: DocumentEvidenceDecision[];
  evidenceSha256: Sha256;
}
export interface DocumentEvidencePlan {
  schema: 'stellar-forge.iati-document-evidence.v1';
  id: Sha256;
  revision: number;
  originWorkspace: Sha256;
  createdAt: string;
  updatedAt: string;
  name: string;
  state: DocumentEvidenceState;
  actor: string;
  notes: string;
  limits: DocumentEvidenceLimits;
  selection: DocumentEvidenceSelection;
  documents: DocumentEvidenceRowSource[];
  observationIds: Sha256[];
  review: DocumentEvidenceReview | null;
  previousRecordSha256: Sha256 | null;
  event: { action: string; requestId: string; at: string; actor: string };
  recordSha256: Sha256;
}
export interface DocumentEvidencePlanSummary {
  id: Sha256;
  revision: number;
  name: string;
  state: DocumentEvidenceState;
  createdAt: string;
  updatedAt: string;
  documentCount: number;
  observationCount: number;
  reviewedCount: number;
  retainedBodyBytes: number;
  remainingBodyBytes: number;
  selection: DocumentEvidenceSelection;
  recordSha256: Sha256;
}
export interface DocumentEvidenceOrganisationSummary {
  id: Sha256;
  revision: number;
  name: string;
  state: string;
  sourceId: Sha256;
  candidateSha256: Sha256;
  recordSha256: Sha256;
}
export interface DocumentEvidenceRow extends DocumentEvidenceRowSource {
  observationIds: Sha256[];
  latestObservationSummary: DocumentObservationSummary | null;
  decision: DocumentEvidenceDecision | null;
}
export interface DocumentEvidenceRowsInput {
  revision: number;
  offset?: number;
  /** One to 500 rows; default 50. */
  limit?: number;
  expectedSnapshot?: Sha256;
}
export interface DocumentEvidencePage {
  rows: DocumentEvidenceRow[];
  total: number;
  offset: number;
  limit: number;
  snapshotSha256: Sha256;
}
export interface DocumentEvidenceDetailInput {
  revision: number;
  rowId: Sha256;
  expectedSnapshot?: Sha256;
}
export interface DocumentEvidenceDetail {
  row: DocumentEvidenceRow;
  observations: DocumentObservation[];
  snapshotSha256: Sha256;
  organisationDetail: {
    [key: string]: unknown;
    row: Record<string, unknown>;
    xml: string;
    targets: Array<Record<string, unknown>>;
    snapshotSha256: Sha256;
  };
}
export interface DocumentEvidenceSave {
  requestId: string;
  name: string;
  selection: DocumentEvidenceSelectionInput;
  documentRowIds: Sha256[];
  limits?: Partial<DocumentEvidenceLimits>;
  notes?: string;
  actor: string;
}
export interface DocumentEvidenceNote {
  requestId: string;
  id: Sha256;
  expectedRevision: number;
  name: string;
  notes: string;
  actor: string;
}
export interface DocumentEvidenceObserve {
  requestId: string;
  id: Sha256;
  expectedRevision: number;
  /** Distinct selected rows with the same exact literal URL. */
  rowIds: Sha256[];
  acknowledgeNewObservation?: boolean;
  actor: string;
}
export interface DocumentEvidenceReviewInput {
  requestId: string;
  id: Sha256;
  expectedRevision: number;
  actor: string;
  note: string;
  /** Exactly one explicit decision for every selected document row. */
  decisions: DocumentEvidenceDecision[];
}
export interface DocumentEvidenceRevision {
  id: Sha256;
  revision: number;
}
export interface DocumentEvidenceRowPair {
  beforeRowId: Sha256;
  afterRowId: Sha256;
}
export interface DocumentEvidenceCompare {
  requestId: string;
  before: DocumentEvidenceRevision;
  after: DocumentEvidenceRevision;
  /** Omit for original-source pairing; [] deliberately suppresses automatic pairing. */
  rowPairs?: DocumentEvidenceRowPair[];
  actor: string;
  notes?: string;
}
export interface DocumentEvidenceFieldChange {
  field: string;
  before: unknown;
  after: unknown;
}
export interface DocumentEvidenceComparison {
  schema: string;
  id: Sha256;
  before: DocumentEvidenceRevision & { recordSha256: Sha256 };
  after: DocumentEvidenceRevision & { recordSha256: Sha256 };
  rows: Array<{
    beforeRowId: Sha256 | null;
    afterRowId: Sha256 | null;
    before: DocumentEvidenceRow | null;
    after: DocumentEvidenceRow | null;
    content: 'same' | 'changed' | 'indeterminate' | 'added' | 'removed';
    changes: DocumentEvidenceFieldChange[];
  }>;
  summary: {
    pairs: number;
    added: number;
    removed: number;
    sameCompleteBodies: number;
    changedCompleteBodies: number;
    indeterminate: number;
  };
  rowPairs: DocumentEvidenceRowPair[];
  automaticPairing: { mode: 'EXPLICIT' | 'SAME_SOURCE' | 'UNPAIRED'; reason: string };
  actor: string;
  notes: string;
  recordSha256: Sha256;
}
export interface DocumentEvidenceCorrectionDraft {
  schema: 'stellar-forge.iati-document-correction-draft.v1';
  evidence: DocumentEvidenceRevision & { recordSha256: Sha256; reviewId: Sha256 | null };
  organisation: DocumentEvidenceRevision & { recordSha256: Sha256 };
  currentOrganisationRevision: number;
  rebaseRequired: boolean;
  /** Complete frozen cumulative request for the existing organisation workflow. */
  request: (Record<string, unknown> & {
    requestId: string;
    id: Sha256;
    expectedRevision: number;
    name: string;
    sourceId: Sha256;
    organisationKeys: Sha256[];
    edits: Array<Record<string, unknown>>;
    actor: string;
  }) | null;
  changes: Array<{
    rowId: Sha256;
    observationId: Sha256;
    fromUrl: string;
    toUrl: string;
    targetId: Sha256;
    beforeSha256: Sha256;
  }>;
  requestSha256: Sha256 | null;
  semantics: unknown;
}
export interface DocumentEvidenceObservationResult {
  plan: DocumentEvidencePlan;
  observation: DocumentObservation;
}
export interface DocumentEvidenceRequestStatus {
  requestId: string;
  state: 'NOT_RECORDED' | 'ACQUIRING' | 'RECORDED';
  action?: string;
  input?: DocumentEvidenceSave | DocumentEvidenceNote | DocumentEvidenceObserve | DocumentEvidenceReviewInput | DocumentEvidenceCompare;
  result?: DocumentEvidencePlan | DocumentEvidenceObservationResult | DocumentEvidenceComparison | null;
  plan?: DocumentEvidencePlan | null;
  observation?: DocumentObservation | null;
}
export interface DocumentEvidenceAcquiring extends DocumentEvidenceRequestStatus {
  state: 'ACQUIRING';
  action: 'observe';
  input: DocumentEvidenceObserve;
  result: null;
  plan: DocumentEvidencePlan;
}
export interface DocumentEvidenceStatus {
  [key: string]: unknown;
  schema: string;
  workspaceSha256: Sha256;
  plans: DocumentEvidencePlanSummary[];
  organisationPlans: DocumentEvidenceOrganisationSummary[];
  activeRequests: DocumentEvidenceRequestStatus[];
  maxPlanBytes: number;
}
export interface DocumentEvidenceReceiving {
  schema: 'stellar-forge.iati-document-evidence-receiving.v1';
  state: 'COMPLETE';
  /** Selected imported revision, which can be older than currentPlan. */
  plan: DocumentEvidencePlan;
  /** Latest receiving revision, including a later recipient note after reimport. */
  currentPlan: DocumentEvidencePlan;
  plans: number;
  revisions: number;
  observations: number;
  comparisons: number;
  packet: { bytes: number; sha256: Sha256 };
  semantics: unknown;
}
export interface DocumentEvidencePacketInput {
  body: BodyInit | AsyncIterable<Uint8Array>;
  bytes: number;
}
export interface DocumentEvidenceClient {
  status(options?: RequestOptions): Promise<DocumentEvidenceStatus>;
  plan(id: Sha256, options?: RevisionOptions): Promise<DocumentEvidencePlan>;
  operatingSource(id: Sha256, options?: RevisionOptions): Promise<DocumentOperatingSource>;
  history(id: Sha256, options?: RequestOptions): Promise<{ history: DocumentEvidencePlan[] }>;
  request(requestId: string, options?: RequestOptions): Promise<DocumentEvidenceRequestStatus>;
  rows(id: Sha256, input: DocumentEvidenceRowsInput, options?: RequestOptions): Promise<DocumentEvidencePage>;
  /** Preserves one snapshot and verifies every complete page and continuation. */
  rowPages(id: Sha256, input: DocumentEvidenceRowsInput, options?: RequestOptions): AsyncGenerator<DocumentEvidencePage, void, unknown>;
  detail(id: Sha256, input: DocumentEvidenceDetailInput, options?: RequestOptions): Promise<DocumentEvidenceDetail>;
  observation(id: Sha256, options?: RequestOptions): Promise<DocumentObservation>;
  comparison(id: Sha256, options?: RequestOptions): Promise<DocumentEvidenceComparison>;
  correction(id: Sha256, options: RequestOptions & { revision: number }): Promise<DocumentEvidenceCorrectionDraft>;
  save(input: DocumentEvidenceSave, options?: RequestOptions): Promise<DocumentEvidencePlan>;
  note(input: DocumentEvidenceNote, options?: RequestOptions): Promise<DocumentEvidencePlan>;
  observe(input: DocumentEvidenceObserve, options?: RequestOptions): Promise<DocumentEvidenceObservationResult | DocumentEvidenceAcquiring>;
  review(input: DocumentEvidenceReviewInput, options?: RequestOptions): Promise<DocumentEvidencePlan>;
  compare(input: DocumentEvidenceCompare, options?: RequestOptions): Promise<DocumentEvidenceComparison>;
  /** Caller consumes or cancels the full original response and verifies its native file descriptor. */
  file(id: Sha256, kind: DocumentEvidenceFileKind, options: RequestOptions & { revision: number }): Promise<Response>;
  body(observationId: Sha256, options?: RequestOptions): Promise<Response>;
  export(id: Sha256, options?: RevisionOptions): Promise<Response>;
  receive(input: DocumentEvidencePacketInput, options?: RequestOptions): Promise<DocumentEvidenceReceiving>;
}
export type DocumentEvidenceRequestBridge = (path: string, options?: RequestOptions & {
  body?: BodyInit | AsyncIterable<Uint8Array>;
  headers?: Record<string, string>;
  raw?: boolean;
  maximum?: number;
}) => Promise<unknown>;
export declare function createDocumentEvidenceClient(request: DocumentEvidenceRequestBridge): Readonly<DocumentEvidenceClient>;
export declare const DOCUMENT_EVIDENCE_PREFIX: '/api/iati/document-evidence/';
export declare const DOCUMENT_EVIDENCE_FILE_KINDS: readonly DocumentEvidenceFileKind[];
