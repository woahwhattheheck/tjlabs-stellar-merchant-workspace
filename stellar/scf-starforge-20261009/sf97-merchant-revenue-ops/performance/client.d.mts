/** Complete HTTP contract for the original merchant performance workspace. */
import type {
  TariffSelection, TariffComparison, TariffPreviewInput, TariffPreviewResult,
  TariffPlan, TariffCommitSelectionResult
} from '../tariffs/client.mjs';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];
export interface JsonObject {readonly [key: string]: JsonValue;}
export type PerformanceId = string;
export type PerformanceUsageBasis = 'HTTP_2XX' | 'NATIVE_SUCCESS' | 'INBOX_ACCEPTED';
export type PerformanceServiceBasis = 'SERVICE_CONSUMED_REQUESTS' | 'SERVICE_2XX';
export type PerformanceBasis = PerformanceUsageBasis | PerformanceServiceBasis;

interface OriginalPerformanceInputs {
  /** Original completed tariff selection's pricingRequestId. */
  readonly selectionRequestId: string;
  /** Saved version from the original Pricing observation store. */
  readonly usageVersion: string;
  readonly costEdition?: string | null;
  readonly costBasis?: 'BILLED' | 'QUOTED';
}
export type PerformanceInputs = OriginalPerformanceInputs & (
  {
    readonly basis: 'HTTP_2XX';
    readonly optionId?: null;
    readonly servicePeriodSourceId?: null;
  } |
  {
    readonly basis: 'NATIVE_SUCCESS' | 'INBOX_ACCEPTED';
    /** Exact SHA-256 payment-option identity, when selecting one option. */
    readonly optionId?: string | null;
    readonly servicePeriodSourceId?: null;
  } |
  {
    readonly basis: PerformanceServiceBasis;
    readonly optionId?: null;
    readonly servicePeriodSourceId: string;
  }
);
export interface PerformanceSaveInput {
  readonly requestId: string;
  readonly label: string;
  readonly performanceSha256: string;
  readonly inputs: PerformanceInputs;
}
export interface PerformanceSnapshotText {
  readonly name: string;
  /** Complete original UTF-8 source text. */
  readonly text: string;
}
export interface PerformanceServicePeriodInput {
  readonly requestId: string;
  readonly label: string;
  readonly opening: PerformanceSnapshotText;
  readonly closing: PerformanceSnapshotText;
}
export interface PerformanceProposalInput {
  readonly performanceId: PerformanceId;
  /** Canonical decimal integer text, preserving the exact requested quantity. */
  readonly proposedMonthlyRequests: string;
}
export interface PerformanceSaveProposalInput extends PerformanceProposalInput {
  readonly proposalSha256: string;
  readonly requestId: string;
  readonly label: string;
}
export interface PerformanceCommitProposalInput {
  readonly performanceId: PerformanceId;
  readonly proposalRequestId: string;
  readonly selection: TariffSelection;
  readonly planRequestId: string;
  readonly pricingRequestId: string;
}
export interface PerformancePageOptions {
  readonly after?: string;
  readonly limit?: number;
}
export interface PerformanceRequestOptions {readonly signal?: AbortSignal;}
export interface PerformanceClientOptions extends PerformanceRequestOptions {
  /** Standalone /#token=HEX64, or the original managed /performance/ launch URL. */
  readonly url: string | URL;
  /** Managed host: the token from its original GET /api/state. */
  readonly token?: string;
  readonly fetch?: typeof globalThis.fetch;
}

/** Monetary fields and quantities retain the original decimal string representation. */
export interface PerformanceReview {
  readonly performanceSha256: string;
  readonly [key: string]: unknown;
}
export type PerformanceNormalizedInputs = {
  readonly selectionRequestId: string;
  readonly usageVersion: string;
  readonly costEdition: string | null;
  readonly costBasis: 'BILLED' | 'QUOTED';
} & (
  {readonly basis: 'HTTP_2XX'; readonly optionId: null; readonly servicePeriodSourceId: null} |
  {
    readonly basis: 'NATIVE_SUCCESS' | 'INBOX_ACCEPTED';
    readonly optionId: string | null;
    readonly servicePeriodSourceId: null;
  } |
  {readonly basis: PerformanceServiceBasis; readonly optionId: null; readonly servicePeriodSourceId: string}
);
export interface PerformanceRecord {
  readonly schema: 'stellar-forge.merchant-tariff-performance-record.v1';
  readonly performanceId: PerformanceId;
  readonly requestId: string;
  readonly requestSha256: string;
  readonly label: string;
  readonly savedAt: string;
  readonly inputs: PerformanceNormalizedInputs;
  readonly review: PerformanceReview;
}
export interface PerformancePage<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly nextAfter: string | null;
}
export interface PerformanceSummary {
  readonly performanceId: PerformanceId;
  readonly sourceId: string;
  readonly label: string;
  readonly savedAt: string;
  readonly performanceSha256: string;
  readonly selectionRequestId: string;
  readonly pricingVersion: string;
  readonly usageVersion: string;
  readonly routeId: string;
  readonly method: string;
  readonly path: string;
  readonly basis: PerformanceBasis;
  readonly quantity: string;
  readonly period: JsonValue;
  readonly savedValueUsd: string;
  readonly tariffValueUsd: string;
  readonly deltaUsd: string;
}
export interface PerformanceServiceSummary {
  readonly sourceId: string;
  readonly label: string;
  readonly from: string;
  readonly until: string;
  readonly orderRef: string;
  readonly planId: string;
  readonly routeId: string;
  readonly totals: JsonObject;
  readonly routes: readonly JsonObject[];
  readonly timeBasis: string;
}
export interface PerformanceState {
  readonly schema: string;
  readonly pricing: PerformancePage<JsonObject>;
  readonly tariffs: JsonValue;
  readonly reviews: PerformancePage<PerformanceSummary>;
  readonly servicePeriods: PerformancePage<PerformanceServiceSummary>;
  readonly limits: {readonly sourceBytes: 50331648};
  readonly files: readonly PerformanceFilename[];
}
export type PerformanceSourcePage = PerformancePage<JsonObject>;
export interface PerformanceSourceRoute {
  readonly routeId: string;
  readonly method: string;
  readonly path: string;
  readonly actual2xx: string;
  readonly actual402: string;
  readonly unitPriceUsd: string | null;
  readonly paymentOptions: JsonValue;
  readonly nativeOptions: JsonValue;
}
export interface PerformanceSourceVersion {
  readonly version: string;
  readonly revision: string;
  readonly label: string;
  readonly savedAt: string;
  readonly reportSha256: string;
  readonly observationKind: string;
  readonly period: JsonValue;
  readonly observation: JsonObject | null;
  readonly routes: readonly PerformanceSourceRoute[];
  readonly native: {
    readonly generatedAt: string;
    readonly totals: JsonObject;
    readonly issues: JsonValue;
  } | null;
  readonly costEditions: {
    readonly items: readonly JsonObject[];
    readonly nextAfter: string | null;
    readonly description: string;
  };
}
export type PerformanceServicePeriodPage = PerformancePage<PerformanceServiceSummary>;
export interface PerformanceServicePeriod extends PerformanceServiceSummary {
  readonly status: 'PERFORMANCE_SERVICE_CAPTURED';
  readonly recovered: boolean;
  readonly requestId: string;
}
export interface PerformancePreview {
  readonly inputs: PerformanceNormalizedInputs;
  readonly review: PerformanceReview;
}
export interface PerformanceSavedReview extends PerformanceSummary {
  readonly status: 'PERFORMANCE_SAVED' | 'PERFORMANCE_RECEIVED';
  readonly recovered: boolean;
  readonly record: PerformanceRecord;
}
export type PerformanceReviewPage = PerformancePage<PerformanceSummary>;
export interface PerformanceProposalOperation {
  readonly proposalRequestId: string;
  readonly request: JsonObject;
  readonly createdAt: string;
  readonly status: 'SAVED' | 'RESUME';
  readonly result: JsonValue;
}
export interface PerformanceSelectionOperation {
  readonly pricingRequestId: string;
  readonly request: JsonObject;
  readonly createdAt: string;
  readonly status: string;
  readonly result: JsonValue;
}
export interface PerformanceLoadedReview {
  readonly sourceId: string;
  readonly record: PerformanceRecord;
  readonly operations: {
    readonly proposals: readonly PerformanceProposalOperation[];
    readonly selections: readonly PerformanceSelectionOperation[];
  };
}
export interface PerformanceProposal {
  readonly schema: 'stellar-forge.merchant-performance-proposal.v1';
  readonly performanceId: PerformanceId;
  readonly performanceSourceId: string;
  readonly performanceSha256: string;
  readonly proposedMonthlyRequests: string;
  readonly observedQuantity: string;
  readonly observedBasis: PerformanceBasis;
  readonly observedPeriod: JsonValue;
  /** Original tariff source version used to author the selected plan. */
  readonly sourceVersion: string;
  readonly tariffId: string;
  readonly inputs: TariffPreviewInput;
  readonly tariffReviewSha256: string;
  readonly comparisonId: string;
  readonly comparison: TariffComparison;
  readonly proposalSha256: string;
  readonly preview: TariffPreviewResult;
}
export interface PerformanceSavedProposal {
  readonly status: 'PERFORMANCE_PROPOSAL_SAVED';
  readonly performanceId: PerformanceId;
  readonly proposalRequestId: string;
  readonly proposalSha256: string;
  readonly recovered: boolean;
  readonly proposal: Omit<PerformanceProposal, 'preview'>;
  readonly plan: TariffPlan;
  readonly selection: TariffSelection | null;
  readonly selectionError: {
    readonly code: string;
    readonly message: string;
    readonly status: number;
  } | null;
}
export interface PerformanceCommitProposalResult {
  readonly status: 'PERFORMANCE_PRICING_SAVED';
  readonly performanceId: PerformanceId;
  readonly proposalRequestId: string;
  readonly pricingRequestId: string;
  readonly result: TariffCommitSelectionResult;
  readonly recovered: boolean;
}

export type PerformanceOriginalFile = PerformanceSourceFile & (
  {readonly text: string; readonly base64?: never} |
  {readonly base64: string; readonly text?: never}
);
export interface PerformanceOriginals {
  readonly pricing: readonly {
    readonly version: string;
    readonly files: readonly PerformanceOriginalFile[];
  }[];
  readonly tariffPortfolio: JsonObject;
  readonly scenarioPlans: readonly JsonObject[];
  readonly costEdition: {
    readonly edition: JsonValue;
    readonly files: readonly PerformanceOriginalFile[];
    readonly originals: readonly {
      readonly sourceId: string;
      readonly files: readonly PerformanceOriginalFile[];
    }[];
  } | null;
  readonly servicePeriod: JsonObject | null;
}
export interface PerformancePortableSource {
  readonly schema: string;
  readonly id: PerformanceId;
  readonly record: PerformanceRecord;
  readonly originals: PerformanceOriginals;
}
export interface PerformanceSourceFile {
  readonly name: string;
  readonly bytes: number;
  readonly sha256: string;
}
export interface PerformanceInspection {
  readonly id: PerformanceId;
  readonly record: PerformanceRecord;
  readonly review: PerformanceReview;
  readonly files: readonly PerformanceSourceFile[];
}
export type PerformanceFilename = 'source.json' | 'review.json' | 'review.html' | 'usage.csv';
export const PERFORMANCE_FILES: readonly ['source.json', 'review.json', 'review.html', 'usage.csv'];
export interface PerformanceDownload {
  readonly filename: string;
  readonly contentType: string;
  readonly bytes: Uint8Array;
  readonly headers: Readonly<Record<string, string>>;
}
export type PerformanceInterruptedOutcome = 'READ_FAILED' | 'UNKNOWN';
export interface PerformanceHttpErrorOptions {
  readonly status: number;
  readonly method: string;
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly rawBody: string;
  readonly body: unknown;
}
export class PerformanceHttpError extends Error {
  constructor(options: PerformanceHttpErrorOptions);
  readonly name: 'PerformanceHttpError';
  readonly code: string;
  readonly status: number;
  readonly method: string;
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly rawBody: string;
  readonly body: unknown;
  readonly requestId: string | null;
}
export class PerformanceTransportError extends Error {
  constructor(options: {
    method: string; url: string; cause: unknown; status?: number | null;
    outcome?: PerformanceInterruptedOutcome;
  });
  readonly name: 'PerformanceTransportError';
  readonly code: 'PERFORMANCE_TRANSPORT_ERROR';
  readonly method: string;
  readonly url: string;
  readonly status: number | null;
  readonly outcome: PerformanceInterruptedOutcome;
}
export class PerformanceProtocolError extends Error {
  constructor(options: {
    method: string; url: string; status: number;
    headers: Readonly<Record<string, string>>; rawBody: string;
    outcome?: PerformanceInterruptedOutcome;
  });
  readonly name: 'PerformanceProtocolError';
  readonly code: 'PERFORMANCE_PROTOCOL_ERROR';
  readonly method: string;
  readonly url: string;
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly rawBody: string;
  readonly outcome: PerformanceInterruptedOutcome;
}

export class PerformanceClient {
  constructor(options: PerformanceClientOptions);
  readonly origin: string;
  readonly apiPrefix: '/api' | '/api/performance';
  state(options?: PerformanceRequestOptions): Promise<PerformanceState>;
  sources(page?: PerformancePageOptions, options?: PerformanceRequestOptions): Promise<PerformanceSourcePage>;
  source(version: string, options?: PerformanceRequestOptions): Promise<PerformanceSourceVersion>;
  servicePeriods(page?: PerformancePageOptions, options?: PerformanceRequestOptions): Promise<PerformanceServicePeriodPage>;
  captureServicePeriod(input: PerformanceServicePeriodInput, options?: PerformanceRequestOptions): Promise<PerformanceServicePeriod>;
  preview(inputs: PerformanceInputs, options?: PerformanceRequestOptions): Promise<PerformancePreview>;
  save(input: PerformanceSaveInput, options?: PerformanceRequestOptions): Promise<PerformanceSavedReview>;
  list(page?: PerformancePageOptions, options?: PerformanceRequestOptions): Promise<PerformanceReviewPage>;
  load(performanceId: PerformanceId, options?: PerformanceRequestOptions): Promise<PerformanceLoadedReview>;
  capture(performanceId: PerformanceId, options?: PerformanceRequestOptions): Promise<PerformancePortableSource>;
  download(performanceId: PerformanceId, name: PerformanceFilename, options?: PerformanceRequestOptions): Promise<PerformanceDownload>;
  inspect(source: PerformancePortableSource, options?: PerformanceRequestOptions): Promise<PerformanceInspection>;
  receive(source: PerformancePortableSource, options?: PerformanceRequestOptions): Promise<PerformanceSavedReview>;
  proposal(input: PerformanceProposalInput, options?: PerformanceRequestOptions): Promise<PerformanceProposal>;
  saveProposal(input: PerformanceSaveProposalInput, options?: PerformanceRequestOptions): Promise<PerformanceSavedProposal>;
  commitProposal(input: PerformanceCommitProposalInput, options?: PerformanceRequestOptions): Promise<PerformanceCommitProposalResult>;
}
export function createPerformanceClient(options: PerformanceClientOptions): PerformanceClient;
