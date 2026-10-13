import type {
  Currency, Customer, InvoiceSummary, InvoiceLine, CreditLine, Receipt, Allocation, HistoryEntry,
  MutationContext, Operation, Money, DateOnly,
} from '../client.mjs';
import type {BankReceiptSourceBinding} from '../bank-client-types.d.ts';
import type {RefundSummary, RefundFundingProposal} from '../refund-client-types.d.ts';
import type {
  XeroFileReference, XeroCashStatus, XeroCashCounts, XeroCashDocument, XeroCashSource,
  XeroCashFinding, XeroErrorOptions, XeroCommitUncertainty,
} from '../xero/client.mjs';
export type {Currency, Customer, InvoiceSummary, InvoiceLine, Receipt, Allocation, MutationContext, Money, DateOnly} from '../client.mjs';

export type CommissioningStatus = 'READY' | 'REVIEW';
export type CommissioningCandidateView = 'customers' | 'invoices' | 'allocations' | 'credits' | 'receipts' | 'refunds' | 'xeroCycles';
export type CommissioningSourceView = 'summary' | 'projects' | 'history';
export interface CommissioningOriginalFile {name: string; dataBase64: string}
export interface CommissioningSourceIdentity {name: string; sha256: string; bytes: number}
export interface CommissioningSourceInput {
  file: CommissioningOriginalFile;
  /** Original currency codes and scales; defaults to EUR/GBP/USD with scale 2. */
  currencyScales?: Record<string, number>;
  expectedSha256?: string;
  label?: string;
  receivedAt?: string;
  replacesSourceId?: string | null;
}
export type ImportCommissioningSource = CommissioningSourceInput & MutationContext;
export interface CommissioningNumericToken {pointer: string; lexeme: string}
export interface CommissioningSourceMilestone {
  index: number; key: string; condition: string;
  /** Original source percentage lexeme, retained without floating-point rounding. */
  percentage: string;
  amount: Money; roundingAdjustmentMinor: string; exactMinorUnits: boolean;
}
export interface CommissioningSourceProject {
  id: string; sourceIndex: number; sourcePointer: string; name: string; currency: Currency;
  fee: Money; originalFee: string; stage: string; owner: string; caseId: string; sourceUrl: string;
  sourceCommit: unknown; sourcePath: unknown; sourceInvoiceDays: number | null;
  /** The complete original project record, including source fields outside this accounting model. */
  source: Record<string, unknown>;
  milestones: CommissioningSourceMilestone[];
}
export interface CommissioningNormalizedSource {
  schema: 'stellar-forge.commissioning-workshares.v1';
  file: CommissioningSourceIdentity; sourceDate: DateOnly | null;
  original: Record<string, unknown>; numericTokens: CommissioningNumericToken[];
  projects: CommissioningSourceProject[]; roundingRule: string;
}
export interface CommissioningInspection {
  revision: number; schema: CommissioningNormalizedSource['schema']; file: CommissioningSourceIdentity;
  sourceDate: DateOnly | null; projectCount: number; numericTokenCount: number; roundingRule: string;
  currencyScales: Record<string, number>; projects: CommissioningSourceProject[];
}
export interface CommissioningProjectBrief {
  id: string; name: string; currency: Currency; fee: Money; stage: string | null;
  owner: string | null; caseId: string | null; milestoneCount: number; sourceIndex: number; sourcePointer: string;
}
export interface CommissioningSourceSummary {
  schema: 'stellar-forge.commissioning-workshare-source.v1';
  id: string; label: string; name: string; sha256: string; bytes: number;
  sourceDate: DateOnly | null; receivedAt: string; createdAt: string; actor: string;
  replacesSourceId: string | null; currencyScales: Record<string, number>; projectCount: number;
  projects: CommissioningProjectBrief[]; captureCount: number; normalizationSha256: string;
}
export interface CommissioningPageQuery {search?: string; offset?: number; limit?: number}
export interface CommissioningPage<T> {
  revision: number; items: T[]; total: number; offset: number; limit: number;
}
export interface CommissioningSourcesQuery extends CommissioningPageQuery {projectId?: string}
export interface CommissioningSourceQuery extends CommissioningPageQuery {view?: CommissioningSourceView}
export interface CommissioningSourceDetail {
  revision: number; source: CommissioningSourceSummary; view: 'summary'; files: XeroFileReference[];
}
export interface CommissioningSourceHistory extends HistoryEntry {
  action: 'source_imported' | 'commissioning_captured';
  replacesSourceId?: string | null; captureId?: string; asOf?: DateOnly; label?: string;
  status?: CommissioningStatus; baselineCaptureId?: string | null;
}
export interface CommissioningSourceProjects extends CommissioningPage<CommissioningSourceProject> {
  source: CommissioningSourceSummary; view: 'projects'; files: XeroFileReference[];
}
export interface CommissioningSourceHistoryPage extends CommissioningPage<CommissioningSourceHistory> {
  source: CommissioningSourceSummary; view: 'history'; files: XeroFileReference[];
}
export type CommissioningSourceResponse = CommissioningSourceDetail | CommissioningSourceProjects | CommissioningSourceHistoryPage;
export type CommissioningSourceFileName = 'original-workshares.json' | 'commissioning-source.json' | 'commissioning-source-receipt.json';

/** A portion of one original issued invoice line. Its complete invoice JSON SHA is required. */
export interface CommissioningInvoiceBinding {
  invoiceId: string; invoiceSha256: string; invoiceLineId: string; netAmount: Money; taxAmount: Money;
}
export interface CommissioningAllocationPortion {allocationId: string; amount: Money}
export interface CommissioningCreditPortion {creditId: string; invoiceLineId: string; netAmount: Money; taxAmount: Money}
export interface CommissioningReceiptPortion {receiptId: string; amount: Money}
export interface CommissioningRefundPortion {refundId: string; amount: Money}
export interface CommissioningMilestoneInput {
  index: number; acceptedDate?: DateOnly | null; plannedAcceptedDate?: DateOnly | null;
  invoiceDays?: number | null; delayDays?: number;
  invoiceLines?: CommissioningInvoiceBinding[]; allocations?: CommissioningAllocationPortion[]; credits?: CommissioningCreditPortion[];
}
export interface CommissioningProjectInput {
  projectId: string; customerId?: string | null;
  milestones?: CommissioningMilestoneInput[];
  receipts?: CommissioningReceiptPortion[]; refunds?: CommissioningRefundPortion[]; xeroCycleIds?: string[];
}
export interface CommissioningSelection {
  asOf: DateOnly; projectIds: string[]; projects?: CommissioningProjectInput[];
  label?: string; baselineCaptureId?: string | null;
}
export type CommissioningInvoiceTermSource = 'UNSPECIFIED' | 'ORIGINAL_SOURCE' | 'OPERATOR_SCENARIO';
export interface CommissioningMilestoneSelection {
  index: number; acceptedDate: DateOnly | null; plannedAcceptedDate: DateOnly | null;
  invoiceDays: number | null; delayDays: number; invoiceTermSource: CommissioningInvoiceTermSource;
  invoiceLines: CommissioningInvoiceBinding[]; allocations: CommissioningAllocationPortion[]; credits: CommissioningCreditPortion[];
}
export interface CommissioningProjectSelection {
  projectId: string; customerId: string | null; milestones: CommissioningMilestoneSelection[];
  receipts: CommissioningReceiptPortion[]; refunds: CommissioningRefundPortion[]; xeroCycleIds: string[];
}
export interface CommissioningReviewedSelection {
  label: string; asOf: DateOnly; projectIds: string[]; projects: CommissioningProjectSelection[]; baselineCaptureId: string | null;
}
export type CaptureCommissioningCollections = (CommissioningSelection | CommissioningReviewedSelection) &
  MutationContext & {previewSha256: string};

export interface CommissioningCandidateQuery<V extends CommissioningCandidateView = CommissioningCandidateView> extends CommissioningPageQuery {
  view?: V; sourceId?: string; projectId?: string; customerId?: string; asOf?: DateOnly;
}
export interface CommissioningInvoiceCandidate extends InvoiceSummary {
  customerId: string; invoiceSha256: string | null; sourceReference: string; lines: InvoiceLine[];
  sourceQuote: Record<string, unknown> | null;
}
export interface CommissioningReceiptLineage {
  id: string; receivedDate: DateOnly; accountingDate: DateOnly; voidDate: DateOnly | null;
  replacesReceiptId: string | null; replacedByReceiptId: string | null;
  replacementReceiptIds: string[]; bankSources: BankReceiptSourceBinding[];
}
export interface CommissioningAllocationCandidate extends Allocation {
  invoiceNumber: string | null; invoiceSha256: string | null; sourceReference: string;
  receiptReference: string | null; active: boolean; asOf: DateOnly; receiptLineage: CommissioningReceiptLineage | null;
  replacesAllocationId?: string | null; dispositionId?: string | null;
}
export interface CommissioningCreditCandidate {
  id: string; number: string; invoiceId: string; invoiceNumber: string | null; customerId: string | null;
  currency: Currency; creditDate: DateOnly; reason: string; lines: CreditLine[];
  totals: {net: Money; tax: Money; total: Money}; creditSha256: string | null; effective: boolean; asOf: DateOnly;
}
export interface CommissioningRefundCandidate extends RefundSummary {
  reason: string; customerNote: string; funding: RefundFundingProposal[]; releasedAllocationIds: string[];
}
export interface CommissioningXeroCycleCandidate {
  schema: string; id: string; label: string; packageId: string; packageIds: string[];
  organisation: string; currency: Currency; customerIds: string[]; asOf: DateOnly;
  baselineCycleId: string | null; createdAt: string; actor: string; reviewSha256: string;
  sourceFingerprint: string; status: XeroCashStatus; counts: XeroCashCounts;
  importIds: string[]; sourceCount: number;
}
export interface CommissioningCandidateMap {
  customers: Customer;
  invoices: CommissioningInvoiceCandidate;
  allocations: CommissioningAllocationCandidate;
  credits: CommissioningCreditCandidate;
  receipts: Receipt;
  refunds: CommissioningRefundCandidate;
  xeroCycles: CommissioningXeroCycleCandidate;
}
export interface CommissioningCandidates<V extends CommissioningCandidateView = CommissioningCandidateView> extends CommissioningPage<CommissioningCandidateMap[V]> {
  view: V; asOf: DateOnly; sourceId: string | null; projectId: string | null; customerId: string | null;
}
export interface CommissioningMilestoneTotals {
  sourceFeeNet: Money; invoicedNet: Money; invoicedTax: Money; allocatedGross: Money;
  creditedNet: Money; creditedTax: Money; amountDueGross: Money; creditBalanceGross: Money;
  unbilledSourceNet: Money; billedAboveSourceNet: Money;
}
export interface CommissioningProjectTotals extends CommissioningMilestoneTotals {
  receivedGross: Money; refundedGross: Money; reservedRefundGross: Money; netRecordedCash: Money;
  /** Null while original verified outgoing cash or selected cash attribution remains unresolved. */
  reconciledNetCash: Money | null;
}
export interface CommissioningMilestoneDates {
  acceptedDate: DateOnly | null; acceptanceEffective: boolean; plannedAcceptedDate: DateOnly | null;
  invoiceDays: number | null; invoiceTermSource: CommissioningInvoiceTermSource; collectionDelayDays: number;
  plannedInvoiceDueDate: DateOnly | null; expectedCollectionDate: DateOnly | null;
  planBasis: 'RECORDED_ACCEPTANCE' | 'PLANNED_ACCEPTANCE' | 'UNSCHEDULED';
  originalInvoiceDueDates: DateOnly[]; allocationDates: DateOnly[]; originalReceiptDates: DateOnly[];
}
export interface CommissioningReviewedInvoiceBinding extends CommissioningInvoiceBinding {
  status: 'REVIEW' | 'EFFECTIVE' | 'DRAFT' | 'FUTURE' | 'VOID';
  invoiceNumber: string | null; issueDate: DateOnly | null; dueDate: DateOnly | null;
  originalLine: InvoiceLine | null; originalInvoice: InvoiceSummary | null;
}
export interface CommissioningReviewedAllocation extends CommissioningAllocationPortion {
  status: 'REVIEW' | 'ACTIVE' | 'INACTIVE'; invoiceId: string | null; receiptId: string | null;
  allocatedDate: DateOnly | null; releasedDate: DateOnly | null; actualReceiptDate: DateOnly | null;
  receiptAccountingDate: DateOnly | null; replacesAllocationId: string | null; dispositionId: string | null;
  original: Allocation | null;
}
export interface CommissioningReviewedCredit extends CommissioningCreditPortion {
  status: 'REVIEW' | 'EFFECTIVE' | 'FUTURE'; invoiceId: string | null; creditNumber: string | null;
  creditDate: DateOnly | null; originalLine: CreditLine | null;
}
export interface CommissioningMilestone {
  index: number; key: string; condition: string; sourcePercentage: string; sourceRounding: CommissioningSourceMilestone;
  dates: CommissioningMilestoneDates; totals: CommissioningMilestoneTotals;
  bindings: CommissioningReviewedInvoiceBinding[]; allocations: CommissioningReviewedAllocation[]; credits: CommissioningReviewedCredit[];
}
export interface CommissioningOriginalReceipt {
  id: string; customerId: string; reference: string; method: string; currency: Currency; amount: Money;
  receivedDate: DateOnly; accountingDate: DateOnly; voidDate: DateOnly | null; status: Receipt['status'];
  source: Record<string, unknown> | null; sourceKey: string | null; bankSources: BankReceiptSourceBinding[];
  correction: Record<string, unknown> | null; replacesReceiptId: string | null; history: HistoryEntry[];
  allocated: Money; refunded: Money; reserved: Money; available: Money; netAmount: Money;
  unreconciledRefunds: Array<Record<string, unknown>>;
}
export interface CommissioningReceiptCash extends CommissioningReceiptPortion {
  kind: 'RECEIPT'; projectId: string; customerId: string | null; currency: Currency;
  status: 'REVIEW' | 'EFFECTIVE' | 'INACTIVE'; effectiveAmount: Money; actualDate: DateOnly | null;
  accountingDate: DateOnly | null; voidDate: DateOnly | null; original: CommissioningOriginalReceipt | null;
}
export interface CommissioningRefundCash extends CommissioningRefundPortion {
  kind: 'REFUND'; projectId: string; customerId: string | null; currency: Currency; receiptId: string | null;
  status: 'REVIEW' | RefundSummary['effectiveStatus']; effectiveAmount: Money; reservedAmount: Money;
  actualDate: DateOnly | null; accountingDate: DateOnly | null; reversedDate: DateOnly | null; original: RefundSummary | null;
}
export type CommissioningCashRow = CommissioningReceiptCash | CommissioningRefundCash;
export interface CommissioningRetainedXeroCycle {
  cycleId: string; packageId: string; packageIds: string[]; asOf: DateOnly; status: XeroCashStatus;
  organisation: string; reviewSha256: string; sourceFingerprint: string;
  observationScope: 'SAME_ACCOUNT_DATE' | 'SAVED_ACCOUNT_DATE';
  documents: XeroCashDocument[]; sources: XeroCashSource[]; findings: XeroCashFinding[];
}
export interface CommissioningProject {
  projectId: string; name: string; customerId: string | null; customer: Customer | null; currency: Currency;
  owner: string; sourceCaseId: string; sourceUrl: string; sourceStage: string; sourceFee: Money;
  sourceInvoiceDays: number | null; sourceProject: Record<string, unknown>; totals: CommissioningProjectTotals;
  milestones: CommissioningMilestone[]; receipts: CommissioningReceiptCash[]; refunds: CommissioningRefundCash[];
  xeroCycles: CommissioningRetainedXeroCycle[];
  collectionCases: Array<Record<string, unknown>>; unassignedCollections: Array<Record<string, unknown>>;
  cashAccountingScope: string;
}
export interface CommissioningCapacity {
  key: string; currency: Currency; capacity: Money; selected: Money; remaining: Money;
  status: 'EXCEEDED' | 'WITHIN_CAPACITY';
}
export interface CommissioningFinding {
  code: string; severity: 'ERROR' | 'WARNING' | 'INFO'; message: string; projectId?: string; milestoneIndex?: number;
  customerId?: string | null; invoiceId?: string; invoiceLineId?: string; receiptId?: string; refundId?: string;
  allocationId?: string; creditId?: string; cycleId?: string; resourceKey?: string; currency?: Currency;
  /** Original monetary identities, source hashes and dated finding details remain available. */
  [key: string]: unknown;
}
export interface CommissioningBaseline {
  captureId: string; asOf: DateOnly; reviewSha256: string; sourceSha256: string;
}
export interface CommissioningChange {
  kind: 'SOURCE_EDITION_CHANGED' | 'PROJECT_ADDED' | 'PROJECT_AMOUNTS_CHANGED' | 'MILESTONE_CHANGED' | 'PROJECT_NOT_SELECTED';
  key: string; before: unknown; after: unknown;
}
export interface CommissioningCounts {
  projects: number; milestones: number; invoiceLineBindings: number; receiptPortions: number;
  refundPortions: number; errors: number; warnings: number;
}
export interface CommissioningAccountingRules {
  monetaryBasis: string; allocationAttribution: string; corrections: string;
  sourceStages: string; xero: string; currencies: string;
}
export interface CommissioningReview {
  schema: 'stellar-forge.commissioning-collections-review.v1'; label: string; asOf: DateOnly;
  workspaceId: string; revision: number;
  source: CommissioningSourceIdentity & {sourceDate: DateOnly | null; roundingRule: string};
  sourceFingerprint: string; selection: CommissioningReviewedSelection;
  projects: CommissioningProject[]; cash: CommissioningCashRow[]; capacities: CommissioningCapacity[];
  currencies: Array<{currency: Currency; projects: number; totals: CommissioningProjectTotals}>;
  findings: CommissioningFinding[]; accountingRules: CommissioningAccountingRules;
  baseline: CommissioningBaseline | null; changes: CommissioningChange[];
  counts: CommissioningCounts; status: CommissioningStatus; summary: string; previewSha256: string;
}
export interface CommissioningPreview {
  revision: number; source: CommissioningSourceSummary; selection: CommissioningReviewedSelection;
  review: CommissioningReview; previewSha256: string; files: XeroFileReference[];
}
export interface CommissioningCaptureSummary {
  schema: 'stellar-forge.commissioning-collections-capture.v1'; id: string; sourceId: string; sourceSha256: string;
  label: string; asOf: DateOnly; createdAt: string; actor: string; workspaceId: string;
  projectIds: string[]; customerIds: string[]; xeroCycleIds: string[]; baselineCaptureId: string | null;
  previewSha256: string; sourceFingerprint: string; status: CommissioningStatus; counts: CommissioningCounts; fileCount: number;
}
export interface CommissioningCapture extends CommissioningCaptureSummary {
  selection: CommissioningReviewedSelection; review: CommissioningReview; files: XeroFileReference[];
}
export interface CommissioningCapturesQuery extends CommissioningPageQuery {
  sourceId?: string; projectId?: string; customerId?: string; status?: CommissioningStatus;
}
export interface CommissioningCaptureResult {revision: number; capture: CommissioningCapture}
export interface CommissioningImportResult {
  revision: number; operation: Operation; source: CommissioningSourceSummary;
}
export interface CommissioningCaptureMutationResult extends CommissioningCaptureResult {
  operation: Operation; source: CommissioningSourceSummary;
}
export type CommissioningRequestResult =
  {revision: number; requestId: string; found: false} |
  {revision: number; requestId: string; found: true; operation: Operation; source?: CommissioningSourceSummary; capture?: CommissioningCapture};
export type CommissioningReportFileName = 'commissioning-review.json' | 'commissioning-projects.csv' |
  'commissioning-milestones.csv' | 'commissioning-cash.csv' | 'commissioning-findings.csv' | 'commissioning-handover.html';
export type CommissioningCaptureFileName = CommissioningReportFileName | CommissioningSourceFileName |
  'commissioning-account-snapshot.json' | 'commissioning-original-files.json' | 'commissioning-baseline.json' |
  'commissioning-capture.json' | 'commissioning-manifest.json' | `original-${string}`;
export interface CommissioningRequestOptions {signal?: AbortSignal}
export interface CommissioningClientOptions {baseUrl?: string; fetch?: typeof globalThis.fetch}
export class CommissioningCollectionsApiError extends Error {
  constructor(message: string, options?: XeroErrorOptions);
  status: number; code: string; details: unknown; requestId: string | null; response: unknown;
  outcomeUnknown?: boolean; reopenRequired?: boolean; commitUncertainty?: XeroCommitUncertainty | null;
}
export class CommissioningCollectionsClient {
  constructor(options?: CommissioningClientOptions);
  readonly baseUrl: string;
  inspectSource(value: CommissioningSourceInput, options?: CommissioningRequestOptions): Promise<CommissioningInspection>;
  importSource(value: ImportCommissioningSource, options?: CommissioningRequestOptions): Promise<CommissioningImportResult>;
  sources(query?: CommissioningSourcesQuery, options?: CommissioningRequestOptions): Promise<CommissioningPage<CommissioningSourceSummary>>;
  source(sourceId: string, query?: CommissioningSourceQuery & {view?: 'summary'}, options?: CommissioningRequestOptions): Promise<CommissioningSourceDetail>;
  source(sourceId: string, query: CommissioningSourceQuery & {view: 'projects'}, options?: CommissioningRequestOptions): Promise<CommissioningSourceProjects>;
  source(sourceId: string, query: CommissioningSourceQuery & {view: 'history'}, options?: CommissioningRequestOptions): Promise<CommissioningSourceHistoryPage>;
  source(sourceId: string, query: CommissioningSourceQuery, options?: CommissioningRequestOptions): Promise<CommissioningSourceResponse>;
  sourceFile(sourceId: string, name: CommissioningSourceFileName | string, options?: CommissioningRequestOptions): Promise<Response>;
  candidates(query?: CommissioningCandidateQuery<'customers'>, options?: CommissioningRequestOptions): Promise<CommissioningCandidates<'customers'>>;
  candidates<V extends CommissioningCandidateView>(query: CommissioningCandidateQuery<V> & {view: V}, options?: CommissioningRequestOptions): Promise<CommissioningCandidates<V>>;
  candidates(query: CommissioningCandidateQuery, options?: CommissioningRequestOptions): Promise<CommissioningCandidates>;
  preview(sourceId: string, value: CommissioningSelection | CommissioningReviewedSelection, options?: CommissioningRequestOptions): Promise<CommissioningPreview>;
  capture(sourceId: string, value: CaptureCommissioningCollections, options?: CommissioningRequestOptions): Promise<CommissioningCaptureMutationResult>;
  captures(query?: CommissioningCapturesQuery, options?: CommissioningRequestOptions): Promise<CommissioningPage<CommissioningCaptureSummary>>;
  detail(captureId: string, options?: CommissioningRequestOptions): Promise<CommissioningCaptureResult>;
  file(captureId: string, name: CommissioningCaptureFileName | string, options?: CommissioningRequestOptions): Promise<Response>;
  /** JSON export metadata from the same saved capture; exportFile reads the actual handover bytes. */
  export(captureId: string, options?: CommissioningRequestOptions): Promise<CommissioningCapture>;
  exportFile(captureId: string, name?: string, options?: CommissioningRequestOptions): Promise<Response>;
  request(requestId: string, options?: CommissioningRequestOptions): Promise<CommissioningRequestResult>;
}
export function createCommissioningCollectionsClient(options?: CommissioningClientOptions): CommissioningCollectionsClient;
export function commissioningImportArguments(
  input: CommissioningSourceInput, inspection: CommissioningInspection,
  operation: Pick<MutationContext, 'actor' | 'requestId'>,
): ImportCommissioningSource;
export function commissioningCaptureArguments(
  preview: CommissioningPreview, operation: Pick<MutationContext, 'actor' | 'requestId'>,
): CaptureCommissioningCollections;
