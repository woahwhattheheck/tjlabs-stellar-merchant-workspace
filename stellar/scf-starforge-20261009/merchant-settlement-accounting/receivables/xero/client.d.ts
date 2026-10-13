import type {BankReceiptSourceBinding} from '../bank-client-types.d.ts';
import type {Currency, Customer, InvoiceSummary, CreditSummary, MutationContext, Money, DateOnly} from '../client.mjs';
export type {Currency, Customer, InvoiceSummary, CreditSummary, MutationContext, Money, DateOnly} from '../client.mjs';

export type XeroDateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY';
export type XeroPackageState = 'PREPARED' | 'PARTIAL' | 'RECEIVED';
export type XeroResolutionStatus = 'UNRESOLVED' | 'REJECTED' | 'IMPORTED' | 'MISMATCH' | 'CONFLICT';
export interface XeroOriginalFile { name: string; dataBase64: string }
export interface XeroFileReference {
  name: string; type: string; bytes: number; sha256: string; role: string;
  documentIds?: string[]; rowCount?: number;
}
export interface XeroTemplateReference { name: string; sha256: string; bytes: number; headers: string[] }
export interface XeroContactMapping { customerId: string; contactName: string }
export interface XeroLineMapping { documentId: string; lineId: string; accountCode: string; taxType: string }
export interface XeroProfileFields {
  name: string; organisation: string; currency: Currency;
  invoiceDateFormat: XeroDateFormat; creditDateFormat: XeroDateFormat;
  accountCode: string; taxType: string;
  contacts?: XeroContactMapping[]; lineMappings?: XeroLineMapping[];
}
export type SaveXeroProfile = MutationContext & XeroProfileFields & (
  {id?: never; expectedVersion?: never; invoiceTemplate: XeroOriginalFile; creditTemplate: XeroOriginalFile} |
  {id: string; expectedVersion: number; invoiceTemplate?: XeroOriginalFile; creditTemplate?: XeroOriginalFile}
);
export interface XeroProfile extends XeroProfileFields {
  id: string; version: number; contacts: XeroContactMapping[]; lineMappings: XeroLineMapping[];
  invoiceTemplate: XeroTemplateReference; creditTemplate: XeroTemplateReference;
}
export interface XeroSelection {
  profileId: string; documentIds: string[]; asOf: DateOnly; parentId?: string;
}
export type XeroPreviewSelection = XeroSelection | {profileId: string; parentId: string; documentIds?: string[]; asOf?: DateOnly};
export interface XeroReviewedSelection extends XeroSelection { profileVersion: number }
export interface XeroPreviewIssue { code: string; message: string; documentId?: string; lineId?: string }
export interface XeroDocument {
  id: string; kind: 'INVOICE' | 'CREDIT_NOTE'; number: string;
  customerId: string; customerName: string; contactName: string; currency: Currency; date: DateOnly;
  /** Canonical decimal amounts, for example "124.00"; preserve them as strings. */
  net: Money; tax: Money; total: Money;
  lineCount: number; sourceSha256: string; invoiceId: string | null; invoiceNumber: string | null;
}
export interface XeroTotals {
  invoices: {net: Money; tax: Money; total: Money};
  credits: {net: Money; tax: Money; total: Money}; currency: Currency;
}
export interface XeroPreview {
  schema: string; revision: number; profile: XeroProfile; ready: boolean; issues: XeroPreviewIssue[];
  selection: XeroReviewedSelection; previewSha256: string;
  documents: XeroDocument[]; totals: XeroTotals; files: XeroFileReference[]; sourceFingerprint: string;
}
export type PrepareXeroPackage = MutationContext & XeroSelection & {previewSha256: string};
export interface XeroResultColumns {
  documentNumber: string; documentId: string; status: string;
  net: string; tax: string; total: string; currency: string; error?: string;
}
export interface XeroReceiveContext extends MutationContext {
  file: XeroOriginalFile; importedStatusValues?: string[]; retiredStatusValues?: string[];
  receivedAt: string; organisation: string;
}
export type ReceiveXeroResult = XeroReceiveContext & (
  {format: 'NATIVE_JSON'; columns?: never; decimalSeparator?: never; groupSeparator?: never; creditSign?: never} |
  {format?: 'CSV_SUMMARY'; columns: XeroResultColumns; decimalSeparator?: '.' | ','; groupSeparator?: '' | ',' | '.' | ' '; creditSign?: 'POSITIVE' | 'NEGATIVE'}
);
export interface CorrectXeroPackage extends MutationContext {
  profileId: string; documentIds?: string[]; asOf?: DateOnly; previewSha256: string;
}
export interface XeroResolution {
  documentId: string; documentNumber: string; status: XeroResolutionStatus;
  externalDocumentId?: string | null; externalDocumentIds: string[]; externalStatus?: string | null; message: string;
  sourceSha256: string; imported: boolean; latestPackageId: string; activeExternalDocumentIds: string[]; sourcePointers?: string[];
  importId?: string; packageId?: string; fileName?: string; sourceRowNumbers: number[]; canCorrect: boolean;
}
export interface XeroReturnedRow {
  rowNumbers: number[]; sourcePointers?: string[]; documentId: string; documentNumber: string; status: XeroResolutionStatus;
  externalDocumentId: string; externalStatus: string; error: string; sourceSha256: string;
  net: Money; tax: Money; total: Money; currency: string | Currency;
}
export interface XeroNativeDocument {
  collection?: string; index?: number; pointer: string; kind: string | null; number: string; id: string;
  type?: string; kindSource?: string; status: string; currency: string;
  amounts: {net: string; tax: string; total: string; rounding?: string};
  canonicalAmounts?: {net?: Money; tax?: Money; total?: Money; rounding?: Money};
  providerRejected?: boolean; validationPointers?: string[]; lineItemCount?: number; lineItemsPresent?: boolean; excludedReason?: string | null;
  /** Full source fields are supplied by the retained interpretation report; compact detail may omit them. */
  fields?: Record<string, string>; lineItems?: Array<{pointer: string; original: unknown; fields?: Record<string, string>}>;
  original?: unknown; issues?: unknown[];
}
export interface XeroNativeMetadata {
  schema: string; sourceKind: string; collections: Array<{name: string; pointer: string; count: number}>;
  envelope: Record<string, unknown>; documentCount: number; consideredCount: number;
  excludedDocuments?: unknown[]; excludedDocumentCount?: number; documents: XeroNativeDocument[];
  numberEncoding?: string; monetaryConvention?: string;
  /** Every original JSON numeric token is retained in the interpretation report. */
  numericTokens?: Array<{pointer: string; lexeme: string}>; numericTokenCount?: number;
}
export interface XeroReceivedImport {
  format: 'NATIVE_JSON' | 'CSV_SUMMARY'; native?: XeroNativeMetadata; retiredStatusValues?: string[];
  id: string; packageId: string; receivedAt: string; recordedAt: string; actor: string; organisation: string;
  file: {name: string; sha256: string; bytes: number}; fileName: string; reportName: string;
  columns?: XeroResultColumns; decimalSeparator?: '.' | ','; groupSeparator?: '' | ',' | '.' | ' ';
  creditSign?: 'POSITIVE' | 'NEGATIVE'; importedStatusValues: string[];
  rows: XeroReturnedRow[]; unmatchedRows: number[]; sourceRowCount?: number; organisationKey?: string;
}
export interface XeroPackageSummary {
  id: string; title: string; createdAt: string; actor: string; profileId: string; profileVersion: number;
  organisation: string; asOf: DateOnly; parentId: string | null;
  documentCount: number; state: XeroPackageState; resolvedCount: number; unresolvedCount: number; correctableCount: number; totals: XeroTotals;
}
export interface XeroHistoryEntry {
  at?: string; recordedAt?: string; actor?: string; action?: string; type?: string;
  id?: string; requestId?: string; [key: string]: unknown;
}
export interface XeroPackage extends XeroPackageSummary {
  schema: string; sourceFingerprint: string; previewSha256: string; family: XeroPackageSummary[];
  selection: XeroReviewedSelection; documents: XeroDocument[]; files: XeroFileReference[];
  profile: XeroProfile; imports: XeroReceivedImport[]; resolutions: XeroResolution[]; history: XeroHistoryEntry[];
  cashCycles: XeroCashCycleSummary[];
}
export interface XeroState {
  schema: string; revision: number; asOf: DateOnly; workspaceId: string; sourcesSha256: string;
  profiles: XeroProfile[]; packages: XeroPackageSummary[];
  customers: Customer[]; invoices: InvoiceSummary[]; credits: CreditSummary[];
}
export interface XeroDetail { package: XeroPackage; revision: number }
export interface XeroOperation {
  id: string; action: string; actor: string; at: string; intentSha256: string; replayed: boolean;
  result: {xeroProfileId?: string; xeroProfileVersion?: number; xeroPackageId?: string; importId?: string; xeroCashCycleId?: string; [key: string]: unknown};
}
export interface XeroProfileMutationResult { profile: XeroProfile; revision: number; operation: XeroOperation }
export interface XeroPackageMutationResult { package: XeroPackage; revision: number; operation: XeroOperation }
export type XeroExportRecord = XeroPackage;

export type XeroCashStatus = 'MATCHED' | 'DIFFERENCES' | 'REVIEW_REQUIRED';
export type XeroCashEntryKind = 'PAYMENT' | 'REFUND' | 'CREDIT_APPLICATION' | 'PREPAYMENT_APPLICATION' | 'OVERPAYMENT_APPLICATION';
export type XeroCashEntryStatus = 'UNMATCHED' | 'MATCHED' | 'PARTIALLY_MATCHED' | 'REVIEW_REQUIRED' |
  'MATCH_REVIEW_REQUIRED' | 'AFTER_ACCOUNT_DATE' | 'NO_CASH' | 'DELETED' | 'VOIDED';
export type XeroCashSourceKind = 'CREDIT_NOTE' | 'PREPAYMENT' | 'OVERPAYMENT';
export type XeroCashAccountingRole = 'ACTIVE_ALLOCATION' | 'DISPOSITION_FUNDING' | 'ISSUED_CREDIT' | 'ACTUAL_REFUND';
export interface XeroCashOrigin {
  sourceId: string; sourceSha256: string; name: string; pointer: string;
  observedAt: string; recordedAt: string | null; importId: string | null; packageId: string | null;
}
export interface XeroCashSourceSummary {
  id: string; name: string; sha256: string; bytes: number; observedAt: string;
  recordedAt: string | null; importId: string | null; packageId: string | null;
  status: 'READ' | 'SOURCE_ERROR' | 'NO_CASH_COLLECTION' | 'PROVIDER_REJECTED';
  code?: string; message?: string; responseId?: string | null; responseStatus?: string | null;
  providerName?: string | null; responseDate?: string | null; numericTokenCount?: number;
  collections?: Array<{name: 'Invoices' | 'CreditNotes' | 'Payments' | 'Prepayments' | 'Overpayments'; count: number}>;
}
/** Raw values, original number lexemes and source pointers survive the interpretation. */
export interface XeroCashFieldEvidence {
  present?: boolean; valid?: boolean; amount?: Money | null; raw?: unknown;
  pointer?: string; sourceType?: string; reason?: string | null; [key: string]: unknown;
}
export interface XeroCashDateEvidence {
  present?: boolean; valid: boolean; date: DateOnly | null;
  values: Array<{key: string; raw: unknown; date?: DateOnly | null; pointer?: string}>;
  [key: string]: unknown;
}
export interface XeroCashApplicationEvidence {
  valid: boolean; amount: Money | null; mode?: string; date?: DateOnly | null; dates?: DateOnly[];
  allocationIds?: string[]; deletedIds?: string[]; fields?: Array<Record<string, unknown>>;
  errors?: string[]; [key: string]: unknown;
}
export interface XeroCashRepresentationBridge {
  kind: 'CREDIT_DISPOSITION' | 'CREDIT_REFUND'; entryKey: string; amount: Money;
  creditId: string; sourceInvoiceId: string; targetInvoiceId: string | null;
  targetAllocationId: string | null; groupId: string; dispositionId?: string; refundId?: string;
  effectiveDate: DateOnly; sourceAllocationIds: string[]; receiptId: string;
}
export interface XeroCashEntry {
  key: string; kind: XeroCashEntryKind; externalId: string; externalInvoiceId: string | null;
  documentId: string | null; documentNumber: string | null; customerId: string | null; customerName: string | null;
  currency: Currency; amount: Money | null; date: DateOnly | null; status: XeroCashEntryStatus; message: string;
  native: XeroCashNativeMatch[]; matchedAmount: Money; remainingAmount: Money | null;
  candidateKeys: string[]; sources: XeroCashOrigin[]; providerStatus: string | null; observedAt: string;
  dateDifferenceReason?: string; representationBridges?: XeroCashRepresentationBridge[];
  paymentId?: string; paymentType?: string | null; bankAmount?: string | null; bankCurrencyCode?: string | null;
  isReconciled?: boolean | null; currencyRate?: string | null; bankAccount?: Record<string, unknown> | null;
  reference?: string | null; sourceKind?: XeroCashSourceKind; sourceExternalId?: string;
  creditId?: string | null; creditDocumentNumber?: string | null;
  amountEvidence?: XeroCashFieldEvidence; dateEvidence?: XeroCashDateEvidence;
  bankAmountEvidence?: {present: boolean; raw: unknown};
  reconciledEvidence?: {present: boolean; value: unknown};
  applicationEvidence?: XeroCashApplicationEvidence; allocationIds?: string[]; deletedAllocationIds?: string[];
}
export interface XeroCashReceiptReference {
  id: string; reference: string; amount: Money; receivedDate: DateOnly; accountingDate: DateOnly;
  replacesReceiptId: string | null; replacementReceiptIds: string[];
  replacementRole: 'CORRECTION' | 'RESIDUAL' | null; sourceKey: string | null; bankSourceCount: number;
}
export interface XeroCashReceiptLineage extends XeroCashReceiptReference {
  customerId: string; currency: Currency; status: 'RECORDED' | 'VOID'; voidDate: DateOnly | null;
  source: Record<string, unknown> | null; bankSources: BankReceiptSourceBinding[];
}
export interface XeroCashFundingGroup {
  groupId: string; kind: 'DISPOSITION' | 'REFUND'; ownerId: string; amount: Money; effectiveDate: DateOnly;
}
export interface XeroCashDispositionAssociation {
  groupId: string; dispositionId: string; targetAllocationId: string; originalTargetAllocationId: string;
  invoiceId: string; sourceInvoiceId: string; effectiveDate: DateOnly; amount: Money; originalTargetAmount: Money;
}
export interface XeroCashNativeRow {
  kind: XeroCashNativeKind; id: string; key: string; accountingRole: XeroCashAccountingRole;
  customerId: string; customerName: string | null; amount: Money; currency: Currency; date: DateOnly;
  matchedAmount: Money; remainingAmount: Money; sourceSha256: string;
  invoiceId?: string; receiptId?: string; documentNumber?: string | null; reference?: string | null;
  receivedDate?: DateOnly; accountingDate?: DateOnly; effectiveDate?: DateOnly; releasedDate?: DateOnly | null;
  receipt?: XeroCashReceiptReference | null; receiptLineageKey?: string;
  /** DISPOSITION_FUNDING retains the original released allocation identity and eligible portion. */
  originalAmount?: Money; dispositionId?: string | null; replacesAllocationId?: string | null;
  fundingGroups?: XeroCashFundingGroup[]; requiresRepresentationBridge?: boolean;
  dispositionAssociations?: XeroCashDispositionAssociation[];
  transaction?: string | null; replacesRefundId?: string | null;
}
export interface XeroCashSource {
  kind: XeroCashSourceKind; externalId: string; documentId: string | null; customerId: string | null;
  contact: Record<string, unknown> | null; status: string | null; currency: Currency; sourceCurrencyCode: string | null;
  total: Money | null; remainingCredit: Money | null;
  totalEvidence: XeroCashFieldEvidence; remainingCreditEvidence: XeroCashFieldEvidence; sources: XeroCashOrigin[];
}
export interface XeroCashBindingRequest {
  kind: 'PREPAYMENT' | 'OVERPAYMENT'; externalId: string; contactId: string | null; contactName: string | null;
  sources: XeroCashOrigin[];
}
export interface XeroCashFinding {
  id: string; code: string; severity: 'ACTION' | 'INFO'; message: string;
  entryKey?: string; documentId?: string; documentNumber?: string; receiptId?: string;
  sourceId?: string; sourceSha256?: string; [key: string]: unknown;
}
export interface XeroCashDifference { field: string; native: Money; provider: Money; difference: Money }
export interface XeroCashBalanceField {
  present: boolean; valid: boolean; amount: Money | null; conflict?: boolean; observedAt?: string;
  observations: Array<XeroCashOrigin & {field: XeroCashFieldEvidence}>;
}
export interface XeroCashCollection {
  present: boolean; valid: boolean; ids: Array<string | null>; conflict: boolean; observedAt?: string;
  sources: XeroCashOrigin[];
}
export interface XeroCashApplicationTotal {
  amount: Money | null; knownAmount: Money; complete: boolean; missingIds: string[]; entryKeys: string[];
}
export interface XeroCashInvoiceProvider {
  status: string | null; currencyCode: string | null; observedAt: string | null;
  directPayments: Money | null; amountPaid: Money | null; amountCredited: Money | null;
  prepaymentApplied: Money | null; overpaymentApplied: Money | null; creditNotesApplied: Money | null;
  amountDue: Money | null; total: Money | null; paidCash: Money | null;
  fields: Record<'Total' | 'AmountPaid' | 'AmountCredited' | 'AmountDue', XeroCashBalanceField>;
  collections: Record<'payments' | 'credits' | 'prepayments' | 'overpayments', XeroCashCollection>;
  applications: Record<'prepayments' | 'overpayments' | 'creditNotes', XeroCashApplicationTotal>;
}
export interface XeroCashDocumentBase {
  id: string; documentId: string; number: string; customerId: string; customerName: string;
  currency: Currency; packageIds: string[]; externalDocumentId: string | null;
  bindingStatus: XeroResolutionStatus; sourceSha256: string;
  differences: XeroCashDifference[]; status: XeroCashStatus; message: string;
}
export interface XeroCashInvoiceDocument extends XeroCashDocumentBase {
  kind: 'INVOICE'; native: InvoiceSummary; provider: XeroCashInvoiceProvider;
  comparison: {paid: Money; credited: Money; amountDue: Money;
    basis: 'ORIGINAL_CREDIT_DISPOSITION' | 'ORIGINAL_NATIVE_LEDGER'; bridges: XeroCashRepresentationBridge[]};
  comparisonScope: {nativeAsOf: DateOnly; providerObservedAt: string | null;
    timing: 'SAME_DATE' | 'LATER_PROVIDER_OBSERVATION' | 'EARLIER_PROVIDER_OBSERVATION' | 'NOT_OBSERVED';
    description: string};
}
export interface XeroCashCreditDocument extends XeroCashDocumentBase {
  kind: 'CREDIT_NOTE';
  native: {total: Money; paid: null; credited: Money; amountDue: null; matched: Money; unrepresented: Money};
  provider: {status: string | null; total: Money | null; remainingCredit: Money | null;
    creditNotesApplied: Money; refunds: Money; amountDue: null;
    totalEvidence: XeroCashFieldEvidence; remainingCreditEvidence: XeroCashFieldEvidence};
}
export type XeroCashDocument = XeroCashInvoiceDocument | XeroCashCreditDocument;
export interface XeroCashBaseline {
  cycleId: string; asOf: DateOnly; label: string; reviewSha256: string; snapshotSha256: string;
}
export type XeroCashChangeKind = 'DOCUMENT_ADDED' | 'DOCUMENT_CHANGED' | 'DOCUMENT_NOT_SELECTED' |
  'CASH_ENTRY_ADDED' | 'CASH_ENTRY_CHANGED' | 'CASH_ENTRY_NOT_OBSERVED' |
  'NATIVE_RECEIPT_ADDED' | 'NATIVE_RECEIPT_CHANGED' | 'NATIVE_RECEIPT_NOT_SELECTED';
export interface XeroCashCycleChange {
  kind: XeroCashChangeKind; key: string; before: Record<string, unknown> | null; after: Record<string, unknown> | null;
  documentNumber?: string; documentId?: string | null; message?: string;
}
export interface XeroCashCounts {
  documents: number; entries: number; matchedEntries: number; unmatchedEntries: number;
  differences: number; reviewRequired: number; findings: number; customerBindings: number;
  nativeRows: number; sources: number; changes: number;
}
export interface XeroCashSourceRules {
  specification: string; version: string; amounts: string; applications: string;
  classifications: string; observations: string; matching: string;
}
export interface XeroCashReview {
  schema: 'stellar-forge.merchant-receivables-xero-cash-review.v1';
  label: string; organisation: string; currency: Currency; asOf: DateOnly;
  packageId: string; packageIds: string[]; workspaceId: string; revision: number;
  sourceFingerprint: string; selection: XeroCashReviewedSelection; rules: XeroCashSourceRules;
  customers: Customer[]; sources: XeroCashSourceSummary[]; documents: XeroCashDocument[];
  entries: XeroCashEntry[]; nativeRows: XeroCashNativeRow[];
  receiptLineage: Record<string, XeroCashReceiptLineage>; cashSources: XeroCashSource[];
  bindingRequests: XeroCashBindingRequest[]; representationBridges: XeroCashRepresentationBridge[];
  findings: XeroCashFinding[]; baseline: XeroCashBaseline | null; changes: XeroCashCycleChange[];
  counts: XeroCashCounts; status: XeroCashStatus; summary: string; previewSha256: string;
}
export type XeroCashReportFileName = 'cash-review.json' | 'cash-documents.csv' | 'cash-entries.csv' |
  'cash-native-rows.csv' | 'cash-findings.csv' | 'cash-cycle-changes.csv' | 'cash-commissioning.html';


/** Original provider JSON and its factual UTC observation time. */
export interface XeroCashOriginalSource { file: XeroOriginalFile; observedAt: string }
export interface XeroCashSourceBinding {
  kind: 'PREPAYMENT' | 'OVERPAYMENT'; externalId: string; customerId: string;
}
export type XeroCashNativeKind = 'ALLOCATION' | 'CREDIT_NOTE' | 'REFUND';
export interface XeroCashNativeMatch {
  kind: XeroCashNativeKind; id: string; amount: Money;
}
export interface XeroCashMatch {
  entryKey: string; native: XeroCashNativeMatch[]; dateDifferenceReason?: string;
}
/** Preserve this original input, including every file's dataBase64, for capture. */
export interface XeroCashSelection {
  packageIds?: string[]; asOf: DateOnly; label?: string; baselineCycleId?: string | null;
  importIds?: string[]; additionalSources?: XeroCashOriginalSource[];
  sourceBindings?: XeroCashSourceBinding[]; matches?: XeroCashMatch[];
}
export interface XeroCashSourceReference {
  name: string; sha256: string; bytes: number; observedAt: string;
}
/** A saved selection contains source identities; original bytes remain in its files. */
export interface XeroCashReviewedSelection {
  packageIds: string[]; asOf: DateOnly; label: string; baselineCycleId: string | null;
  importIds: string[]; additionalSources: XeroCashSourceReference[];
  sourceBindings: XeroCashSourceBinding[]; matches: XeroCashMatch[];
}
export type CaptureXeroCashCycle = MutationContext & XeroCashSelection & {previewSha256: string};
export interface XeroCashCycleSummary {
  schema: 'stellar-forge.merchant-receivables-xero-cash-cycle.v1';
  id: string; label: string; packageId: string; packageIds: string[];
  organisation: string; currency: Currency; customerIds: string[];
  asOf: DateOnly; baselineCycleId: string | null; createdAt: string; actor: string;
  reviewSha256: string; sourceFingerprint: string; status: XeroCashStatus; counts: XeroCashCounts;
  importIds: string[]; sourceCount: number;
}
export interface XeroCashCycle extends XeroCashCycleSummary {
  selection: XeroCashReviewedSelection; review: XeroCashReview; files: XeroFileReference[];
}
export interface XeroCashPreview extends XeroCashReview { revision: number; files: XeroFileReference[] }
export interface XeroCashCycleList { packageId: string; items: XeroCashCycleSummary[]; revision: number }
export interface XeroCashCycleResult { cashCycle: XeroCashCycle; revision: number }
export interface XeroCashCaptureResult extends XeroCashCycleResult { operation: XeroOperation }
export type XeroCashExportRecord = XeroCashCycle;
export interface XeroCashRequestOptions { signal?: AbortSignal }

export interface XeroClientOptions { baseUrl?: string; fetch?: typeof globalThis.fetch }
export interface XeroCommitUncertainty {
  at: string; action: string; revision: number; causeCode: string;
}
export interface XeroErrorOptions {
  status?: number; code?: string; details?: unknown; requestId?: string | null; response?: unknown;
  outcomeUnknown?: boolean; reopenRequired?: boolean; commitUncertainty?: XeroCommitUncertainty | null;
}
export class XeroReceivablesApiError extends Error {
  constructor(message: string, options?: XeroErrorOptions);
  status: number; code: string; details: unknown; requestId: string | null; response: unknown;
  outcomeUnknown?: boolean; reopenRequired?: boolean; commitUncertainty?: XeroCommitUncertainty | null;
}
export class XeroReceivablesClient {
  constructor(options?: XeroClientOptions);
  baseUrl: string; fetch: typeof globalThis.fetch;
  request(path: string, options: {method?: string; body?: unknown; signal?: AbortSignal; binary: true}): Promise<Response>;
  request<T = unknown>(path: string, options?: {method?: string; body?: unknown; signal?: AbortSignal; binary?: false}): Promise<T>;
  state(query?: {asOf?: DateOnly}): Promise<XeroState>;
  saveProfile(value: SaveXeroProfile): Promise<XeroProfileMutationResult>;
  preview(value: XeroPreviewSelection): Promise<XeroPreview>;
  prepare(value: PrepareXeroPackage): Promise<XeroPackageMutationResult>;
  detail(id: string): Promise<XeroDetail>;
  receive(id: string, value: ReceiveXeroResult): Promise<XeroPackageMutationResult>;
  correct(id: string, value: CorrectXeroPackage): Promise<XeroPackageMutationResult>;
  file(id: string, name: string): Promise<Response>;
  export(id: string): Promise<XeroExportRecord>;
  exportFile(id: string, name?: string): Promise<Response>;
  cashPreview(packageId: string, value: XeroCashSelection, options?: XeroCashRequestOptions): Promise<XeroCashPreview>;
  cashCapture(packageId: string, value: CaptureXeroCashCycle, options?: XeroCashRequestOptions): Promise<XeroCashCaptureResult>;
  cashCycles(packageId: string, options?: XeroCashRequestOptions): Promise<XeroCashCycleList>;
  cashCycle(packageId: string, cycleId: string, options?: XeroCashRequestOptions): Promise<XeroCashCycleResult>;
  cashFile(packageId: string, cycleId: string, name: string, options?: XeroCashRequestOptions): Promise<Response>;
  cashExport(packageId: string, cycleId: string, options?: XeroCashRequestOptions): Promise<XeroCashExportRecord>;
  cashExportFile(packageId: string, cycleId: string, name?: string, options?: XeroCashRequestOptions): Promise<Response>;
}
export function createXeroReceivablesClient(options?: XeroClientOptions): XeroReceivablesClient;

/** Keep the original selection used for preview, including original provider file bytes. */
export function xeroCashCaptureArguments(
  selection: XeroCashSelection,
  preview: XeroCashPreview,
  context: Pick<MutationContext, 'actor' | 'requestId'>
): CaptureXeroCashCycle;
