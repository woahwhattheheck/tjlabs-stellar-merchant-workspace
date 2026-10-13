// SPDX-License-Identifier: MIT
export interface BlockrunSelection {
  /** Local account label. The wrapper does not authenticate the provider account. */
  accountReference: string;
  /** Local label for the existing credential, never the API key. */
  keyReference: string;
  /** UTC instants; the exclusive end is at most 400 days after the start. */
  from: string;
  to: string;
  limit: number;
}
export interface BlockrunResponseCapture {
  requestUrl: string;
  status: 200;
  capturedAt: string;
  /** Exact original UTF-8 JSON body, kept as text so decimal tokens retain precision. */
  responseText: string;
}
export interface BlockrunPageCapture extends BlockrunResponseCapture { cursor: string | null; }
export interface BlockrunCapture {
  schema: 'tjlabs.blockrun-usage-capture.v1';
  selection: BlockrunSelection;
  pages: readonly BlockrunPageCapture[];
  summary?: BlockrunResponseCapture | null;
  credits?: BlockrunResponseCapture | null;
}
export interface BlockrunUsageRequest {
  selection: BlockrunSelection;
  method: 'GET';
  url: string;
  cursor: string | null;
}
export interface BlockrunRowView {
  requestId: string;
  timestamp: string;
  endpoint: string;
  model: string | null;
  jobId: string | null;
  jobStatus: string | null;
  correctionOf: string | null;
  kind: string;
  status: number;
  costState: 'priced' | 'free' | 'pending';
  reportedUsd: string | null;
  /** Original fields, with JSON number tokens represented as strings. */
  original: Record<string, unknown>;
}
export interface BlockrunSummaryView {
  capturedAt: string;
  usd: string;
  calls: string;
  tokens: string | null;
  unpricedCalls: string;
  unavailableDays: string[];
  countedThrough: string | null;
  authority: 'ORIGINAL_PROVIDER_WINDOW_TOTALS';
}
export interface BlockrunCreditsView {
  accountId: string;
  capturedAt: string;
  billingMode: 'prepaid' | 'postpaid' | 'ungated';
  blocked: boolean;
  blockedReason: string | null;
  grantedUsd: string;
  spentUsd: string;
  remainingUsd: string | null;
  remainingInterpretation: 'UNLIMITED' | 'PROVIDER_REPORTED_AMOUNT';
  admissionAuthority: 'ORIGINAL_PROVIDER_BLOCKED_FIELD';
}
export interface BlockrunUsageView {
  schema: 'tjlabs.blockrun-account-usage-view.v1';
  evidence: 'CAPTURED_PROVIDER_RESPONSES_WITH_LOCAL_ASSOCIATION';
  selection: BlockrunSelection;
  currency: 'USD';
  pages: Array<{index:number;cursor:string|null;nextCursor:string|null;capturedAt:string;requestUrl:string;reportedRows:number}>;
  coverage: {
    cursorExhausted: boolean;
    nextCursor: string | null;
    nextRequest: BlockrunUsageRequest | null;
    unavailableDays: string[];
    pendingRequestIds: string[];
    summaryCountedThrough: string | null;
    summaryPresent: boolean;
    issues: string[];
  };
  observed: {
    uniqueRows: number;
    duplicateRows: Array<{requestId:string;page:number}>;
    knownPricedAndFreeUsd: string;
    mediaJobs: number;
    correctionRows: number;
    callsInWindow: string | null;
    callCountAuthority: 'ORIGINAL_SUMMARY_EXCLUDES_POLLS_AND_CORRECTIONS' | 'NOT_RECONSTRUCTED_FROM_ROWS';
    rowsMinusSummaryUsd: string | null;
  };
  groups: Array<{
    key: string;
    kind: 'REQUEST' | 'MEDIA_JOB' | 'CORRECTION_WITHOUT_BASE_IN_WINDOW';
    originalRequestId: string | null;
    jobId: string | null;
    requests: string[];
    corrections: string[];
    pending: string[];
    knownPricedAndFreeUsd: string;
    observedRowsFinal: boolean;
  }>;
  rows: BlockrunRowView[];
  providerSummary: BlockrunSummaryView | null;
  providerCredits: BlockrunCreditsView | null;
  fulfillment: 'NOT_ASSESSED';
  interpretation: string;
}
export function parseBlockrunResponse(raw: string): unknown;
export function planBlockrunUsageCapture(selection: BlockrunSelection, cursor?: string | null): BlockrunUsageRequest;
export function projectBlockrunUsageCapture(capture: BlockrunCapture): BlockrunUsageView;
