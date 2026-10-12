// MIT. TypeScript declarations for the original SF47 client and its saved delivery workflow.
import type { Buffer } from 'node:buffer';

export const GRANT_AGENT_SCHEMA: 'stellar-forge.sf47-agent.v1';
export const GRANT_MAX_BUNDLE_BYTES: number;
export const GRANT_MAX_SOURCE_BYTES: number;
export const GRANT_CASE_ACTIONS: readonly GrantCaseAction[];

/** Full native JSON objects retain their original fields and decimal strings. */
export type GrantObject = Record<string, unknown>;
/** YYYY-MM-DD. The native service validates that this is an actual civil date. */
export type GrantCivilDate = string;
export type GrantInstallationStage = 'PLANNED' | 'COMMISSIONING' | 'OPERATING' | 'HANDED_OVER' | 'RETIRED';
export type GrantCheckState = 'OPEN' | 'IN_PROGRESS' | 'ACCEPTED' | 'CHANGES_REQUIRED' | 'NOT_APPLICABLE';
export type GrantDeliveryPriority = 'URGENT' | 'HIGH' | 'NORMAL' | 'LOW';
export type GrantDeliveryDueStatus = 'COMPLETE' | 'INACTIVE' | 'UNDATED' | 'OVERDUE' | 'TODAY' | 'UPCOMING';
export type GrantCaseAction =
  | 'contributor.save' | 'work.save' | 'work.submit' | 'work.accept' | 'work.reopen' | 'work.void'
  | 'invoice.save' | 'invoice.review' | 'invoice.dispute' | 'invoice.reopen' | 'invoice.void'
  | 'cash.record' | 'cash.void' | 'statement.receive' | 'award.save' | 'deployment.save'
  | 'purchase.record' | 'purchase.observe' | 'purchase.void' | 'outcome.save'
  | 'review' | 'close' | 'reopen' | 'cohort.prepare' | 'installation.save' | 'implementation.prepare'
  | 'completion.save' | 'completion.prepare' | 'completion.extension' | 'completion.submit' | 'completion.decision'
  | GrantExpenseAction;

/** Original quantities are atomic integer strings. Native asset scale is always explicit. */
export type GrantExpenseAction = 'expense.receive' | 'expense.save' | 'expense.review' | 'expense.reopen' | 'expense.void';
export type GrantExpenseTransition = 'review' | 'reopen' | 'void';
export type GrantExpenseState = 'DRAFT' | 'REVIEWED' | 'VOID';
export interface GrantExpenseSplit extends GrantObject {
  costId: string;
  fundingBasis: 'GRANT' | 'CUSTOMER' | 'INTERNAL' | 'PREAWARD';
  nativeAmount: string;
  usdValue?: string | null;
  memo?: string;
}
export interface GrantExpenseValuation extends GrantObject {
  mode: 'ENTERED_USD' | 'RETAINED_RATE';
  date: GrantCivilDate;
  sourceIds: string[];
  note: string;
  nativeUnit?: { currency: string; decimals: number } | null;
  /** The original forecast currency rate object, including its retained source and basis. */
  rate?: GrantObject | null;
}
export interface GrantExpenseAllocationInput extends GrantObject {
  id?: string;
  intakeId: string;
  sourceLineId: string;
  expectedSourceRowSha256: string;
  allocations: GrantExpenseSplit[];
  valuation?: GrantExpenseValuation | null;
  unattributedReason?: string;
  linkedInvoiceIds?: string[];
  linkedPurchaseIds?: string[];
  linkedWorkIds?: string[];
}
export interface GrantExpenseLine extends GrantObject {
  intakeId: string;
  sourceLineId: string;
  sourceRowSha256: string;
  workspaceId: string;
  closeId: string;
  kind: 'EXPENSE' | 'CREDIT';
  original: { network: string; asset: string; amount: string };
  attributionId: string | null;
  attributionState: GrantExpenseState | null;
}
export interface GrantExpenseAttribution extends GrantObject {
  id: string;
  state: GrantExpenseState;
  version: number;
  contentSha256: string;
  source: GrantObject;
  allocations: GrantExpenseSplit[];
  valuation: (GrantExpenseValuation & { originalMoney?: GrantObject; calculation?: GrantObject }) | null;
  bookkeepingChanged: boolean;
  currentSource: GrantObject | null;
  allowedActions: GrantExpenseAction[];
}
export interface GrantExpenseDashboard extends GrantObject {
  schema: 'scf.operations.expense-attribution.v1';
  caseId: string;
  version: number;
  sources: GrantObject[];
  lines: GrantExpenseLine[];
  attributions: GrantExpenseAttribution[];
  costs: { id: string; tranche: number; plannedUsd: string }[];
  canReceive: boolean;
  summary: GrantObject;
  reviewItems: GrantObject[];
}
export interface GrantExpensePreview extends GrantObject {
  schema: 'scf.operations.expense-attribution.v1';
  caseId: string;
  version: number;
  filename: string;
  inspection: GrantObject;
  rows: GrantObject[];
  receiving: 'ALREADY_RETAINED' | 'HISTORICAL_EDITION' | 'CURRENT_ORIGINAL';
  retainedIntakeId: string | null;
  previousIntakeId: string | null;
  previewSha256: string;
}
export interface GrantExpenseReceipt extends GrantObject {
  id: string;
  version: number;
  action: GrantExpenseAction;
  kind: string;
  recordId: string;
}
export type GrantExpenseRequest = GrantOperationRequest & { action: GrantExpenseAction; data: GrantObject };
export type GrantExpenseRequestState =
  | { status: 'COMMITTED'; requestId: string; caseId: string; currentVersion: number; receipt: GrantExpenseReceipt }
  | { status: 'NOT_RECORDED'; requestId: string; caseId: string; currentVersion: number };


export type GrantStatementCategory = 'GRANT' | 'INVOICE' | 'CUSTOMER' | 'CAPITAL' | 'REFUND' | 'OTHER';
export interface GrantStatementAllocation {
  invoiceId: string;
  amountUsd: string;
}
export interface GrantStatementDecision {
  /** Physical source line at the beginning of the original CSV record. */
  rowNumber: number;
  action: 'IMPORT' | 'EXCLUDE';
  /** Required for an exclusion. */
  reason?: string;
  category?: GrantStatementCategory;
  tranche?: 0 | 1 | 2 | 3 | null;
  allocations?: GrantStatementAllocation[];
}
export interface GrantStatementInput {
  source: { filename: string; contentBase64: string; observedAt: string; sourceUrl?: string };
  /** Stable nonsecret source account identity; case-sensitive and independent of the filename. */
  accountId: string;
  accountLabel?: string;
  currency: string;
  format: {
    delimiter: ',' | ';' | '\t' | '|';
    decimalMark: '.' | ',';
    groupMark: '' | '.' | ',' | ' ' | '\u00a0' | "'";
    dateFormat: 'YYYY-MM-DD' | 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY/MM/DD';
    amountMode: 'SIGNED' | 'DEBIT_CREDIT';
    positiveDirection: 'IN' | 'OUT';
  };
  /** Exact original heading strings, including any surrounding spaces. */
  columns: {
    date: string; reference: string; description?: string; amount?: string;
    debit?: string; credit?: string; currency?: string; usdValue?: string;
  };
  defaultCategory?: GrantStatementCategory;
  /** Original signed balances use the same selected decimal/thousands format. Supply both together. */
  openingBalance?: string | null;
  closingBalance?: string | null;
  valuationNote?: string;
  decisions?: GrantStatementDecision[];
}
export interface GrantStatementRow {
  rowNumber: number;
  reference: string;
  date: GrantCivilDate | null;
  description: string;
  direction: 'IN' | 'OUT' | null;
  amount: string | null;
  currency: string;
  usdValue: string | null;
  category: GrantStatementCategory;
  tranche: 0 | 1 | 2 | 3 | null;
  allocations: GrantStatementAllocation[];
  action: 'IMPORT' | 'EXCLUDE';
  reason: string;
  status: 'NEW' | 'EXISTING' | 'EXCLUDED' | 'CONFLICT';
  recordId: string | null;
  problems: string[];
  original: Record<string, string>;
  /** Original cash validator result; provisional source and new-record IDs are replaced atomically on receiving. */
  record?: GrantObject;
}
export interface GrantStatementPreview {
  schema: 'stellar-forge.sf47-statements.v1';
  caseId: string;
  expectedVersion: number;
  inputsSha256: string;
  previewSha256: string;
  source: {
    filename: string; bytes: number; sha256: string; sourceUrl: string; observedAt: string;
    accountId: string; accountLabel: string; currency: string; editionSha256: string;
  };
  headers: string[];
  rows: GrantStatementRow[];
  summary: {
    rows: number; newCount: number; existingCount: number; excludedCount: number; conflictCount: number;
    inflow: string; outflow: string; net: string; importInflow: string; importOutflow: string;
    completeAmounts: boolean;
  };
  balance: {
    status: 'MATCH' | 'MISMATCH' | 'NOT_PROVIDED' | 'UNAVAILABLE';
    openingBalance: string | null; closingBalance: string | null;
    calculatedBalance: string | null; difference: string | null;
  };
  findings: { code: string; message: string; rowNumber?: number; recordId?: string | null }[];
  canImport: boolean;
  unchanged: boolean;
  retainedSourceId: string | null;
}
export interface GrantStatementReceipt {
  id: string;
  version: number;
  action: 'statement.receive';
  kind: 'statement';
  recordId: string;
  sourceIds: string[];
  cashIds: string[];
  existingCashIds: string[];
  unchanged: boolean;
  statementSha256: string;
  previewSha256: string;
}

export interface GrantCommercialConnectionInput {
  id: string;
  label: string;
  /** Complete local HTTP API URL including its original port and API path. */
  baseUrl: string;
  actor: string;
  requestId: string;
}
export interface GrantCommercialConnection {
  id: string;
  label: string;
  baseUrl: string;
  workspaceId: string;
  sourcesSha256: string;
  recordedBy: string;
}
export interface GrantCommercialConnections {
  schema: 'stellar-forge.commercial-receivables-connections.v1';
  endpoints: GrantCommercialConnection[];
}
export interface GrantCommercialCustomers {
  revision: number;
  issuer: GrantObject;
  customers: (GrantObject & { id: string; name: string })[];
}
export interface GrantCommercialCurrency { code: string; scale: number; }
export type GrantCommercialBillingBasis = 'PHASE_ACCEPTANCE' | 'COMMERCIAL_AUTHORIZATION';
export interface GrantCommercialScheduleInput {
  expectedVersion: number;
  installationId: string;
  installationRevision: number;
  expectedInstallationSha256: string;
  /** Exact original currency scale, from zero through six. Amounts are never rounded. */
  currencyScale: number;
}
export interface GrantCommercialMilestoneMapping {
  milestoneId: string;
  issueDate: GrantCivilDate;
  dueDate: GrantCivilDate;
  billingBasis: GrantCommercialBillingBasis;
  requiredCheckIds?: string[];
  authorizationSourceIds?: string[];
  authorizationNote?: string;
}
export interface GrantCommercialPrepareInput extends GrantCommercialScheduleInput {
  requestId: string;
  actor: string;
  expectedScheduleSha256: string;
  endpointId: string;
  customerId: string;
  /** Every original schedule milestone appears exactly once. */
  milestones: GrantCommercialMilestoneMapping[];
  purchaseOrder?: string;
  note?: string;
}
export interface GrantCommercialSource {
  sourceId: string;
  sourceSha256: string;
  packetSourceId: string | null;
  packetSha256: string | null;
  caseId: string;
  planSha256: string;
}
export interface GrantCommercialSourceMilestone {
  milestoneId: string;
  sourceIndex: number;
  label: string;
  trigger: string;
  /** Exact fixed-scale native money. */
  amount: string;
  sourceAmount: string | number;
  sourceSha256: string;
  original: GrantObject;
}
export interface GrantCommercialSchedule {
  schema: 'stellar-forge.sf47-commercial-receivables.v1';
  programId: string;
  expectedVersion: number;
  installation: GrantInstallationRef;
  source: GrantCommercialSource;
  customer: unknown;
  supplier: unknown;
  title: string;
  currency: GrantCommercialCurrency;
  amount: string;
  priceStatus: string;
  commercial: GrantObject;
  milestones: GrantCommercialSourceMilestone[];
  phaseChecks: GrantObject[];
  scheduleSha256: string;
}
export interface GrantCommercialEligibility extends GrantObject {
  ready: boolean;
}
export interface GrantCommercialIntent extends GrantObject {
  id: string;
  action: 'draft' | 'issue';
  state: string;
  actor: string;
  attempts: number;
  native: GrantObject | null;
}
export interface GrantCommercialMilestone extends GrantCommercialSourceMilestone, GrantCommercialMilestoneMapping {
  obligationKey: string;
  specificationSha256: string;
  specificationRevision: number;
  superseded: boolean;
  nativeRequestId: string;
  requiredCheckIds: string[];
  authorizationSourceIds: string[];
  authorizationNote: string;
  invoiceId: string | null;
  native: GrantObject | null;
  lastRefreshAt: string | null;
  origin: { programId: string; preparedId: string; milestoneId: string; };
  draftIntent: GrantCommercialIntent | null;
  issueIntent: GrantCommercialIntent | null;
  eligibility: GrantCommercialEligibility;
}
export interface GrantCommercialPrepared {
  schema: 'stellar-forge.sf47-commercial-receivables.v1';
  id: string;
  programId: string;
  sourceProgramId: string;
  createdAt: string;
  actor: string;
  requestId: string;
  endpointId: string;
  accountingIdentity: { workspaceId: string; sourcesSha256: string; [key: string]: unknown; };
  customerId: string;
  nativeCustomer: GrantObject;
  schedule: GrantCommercialSchedule;
  milestones: GrantCommercialMilestone[];
  purchaseOrder: string;
  note: string;
  sourceSnapshot: {
    installation: Omit<GrantInstallationEdition, 'current'>;
    commissioningCase: GrantObject;
    receivingPacket: GrantObject | null;
    workshare: GrantObject;
  };
  preparedSha256: string;
}
export interface GrantCommercialSummary {
  id: string;
  createdAt: string;
  customerName: string;
  currency: GrantCommercialCurrency;
  amount: string;
  milestoneCount: number;
  draftCount: number;
  issuedCount: number;
  voidCount: number;
  pendingCount: number;
  supersededCount: number;
}
export interface GrantCommercialList {
  schema: 'stellar-forge.sf47-commercial-receivables.v1';
  programId: string;
  items: GrantCommercialSummary[];
}
export interface GrantCommercialIssuePreview {
  id: string;
  milestoneId: string;
  invoiceId: string;
  eligibility: GrantCommercialEligibility;
  nativePreview: {
    document: GrantObject;
    previewSha256: string;
    expectedVersion: number;
    revision: number;
  };
  issuePreviewSha256: string;
  retainedIntent?: GrantCommercialIntent;
}
export interface GrantCommercialCommandResult {
  id: string;
  milestoneId: string;
  obligationKey: string;
  requestId: string;
  intent: GrantCommercialIntent;
  native: GrantObject;
  commercial: GrantCommercialPrepared;
}

export interface GrantBindingInput {
  directory: string;
  scenarioFile?: string;
  pythonExecutable?: string;
  allowStart?: boolean;
  label?: string;
}
export interface GrantSourceSelection {
  schema: 'stellar-forge.sf47.workspace-selection.v1';
  workspaceDirectory: string;
  sourceDirectory: string;
  scenarioFile: string;
  scenarioSha256: string;
  pythonExecutable: string;
  pythonRealPath: string;
  sourceSha256: Record<string, string>;
}
export interface GrantBinding {
  directory: string;
  scenarioFile: string;
  pythonExecutable: string;
  allowStart: boolean;
  label: string;
  selectionSha256: string;
  selection: GrantSourceSelection;
}
export interface GrantResponseSource {
  schema: 'stellar-forge.sf47.workspace-launch.v1';
  instanceId: string;
  pid: number;
  selectionSha256: string;
  url: string;
  sourceDirectory: string;
  executionSourceDirectory: string;
}
export interface GrantNativeResponse<T = unknown> {
  value: T | undefined;
  bytes: Buffer;
  mediaType: string;
  status: number;
  sha256: string;
  source: GrantResponseSource;
  filename: string | null;
}
export interface GrantJsonResponse<T> extends GrantNativeResponse<T> { value: T; }
export interface GrantClientSummary {
  schema: typeof GRANT_AGENT_SCHEMA;
  label: string;
  selectionSha256: string;
  allowStart: boolean;
  connection: 'OWNED_ORIGINAL_SERVICE' | 'BORROWED_ORIGINAL_SERVICE' | 'CLOSED' | 'ORIGINAL_SERVICE_UNAVAILABLE';
  instanceId: string | null;
  activeRequests: number;
}
export interface GrantInspection extends GrantClientSummary {
  original?: GrantObject;
  reason?: string;
  recovery?: string;
}
export interface GrantCloseResult {
  schema: typeof GRANT_AGENT_SCHEMA;
  state: 'OWNED_ORIGINAL_SERVICE_CLOSED' | 'BORROWED_CONNECTION_RELEASED';
  originalInstanceId: string | null;
  result?: { code: number | null; signal: string | null; error?: string };
}
/** Failures retain the original code/status and, for an uncertain write, its request ID. */
export interface GrantClientError extends Error {
  code: string;
  status?: number;
  definite?: boolean;
  uncertain?: boolean;
  requestId?: string | null;
  source?: GrantResponseSource;
  recovery?: string;
}

export interface GrantDeliveryStepInput {
  checkId: string;
  /** Empty or omitted inherits the installation assignee. */
  owner?: string;
  /** Empty, null or omitted inherits the installation date. */
  dueDate?: GrantCivilDate | null;
  priority?: GrantDeliveryPriority | 'INHERIT';
  /** Distinct existing check IDs. Self references and cycles are rejected. */
  dependsOn?: string[];
  note?: string;
}
export interface GrantDeliveryCoordinationInput {
  owner?: string;
  dueDate?: GrantCivilDate | null;
  priority?: GrantDeliveryPriority;
  note?: string;
  steps?: GrantDeliveryStepInput[];
}
export interface GrantDeliveryStep {
  checkId: string;
  owner: string;
  dueDate: GrantCivilDate | null;
  priority: GrantDeliveryPriority | 'INHERIT';
  dependsOn: string[];
  note: string;
}
export interface GrantDeliveryCoordination {
  owner: string;
  dueDate: GrantCivilDate | null;
  priority: GrantDeliveryPriority;
  note: string;
  steps: GrantDeliveryStep[];
}
export interface GrantInstallationCheck {
  id: string;
  title: string;
  criterion: string;
  tranche: 1 | 2 | 3 | null;
  required: boolean;
  state: GrantCheckState;
  operator: string;
  observedAt: string | null;
  note: string;
  sourceIds: string[];
  workIds: string[];
  purchaseIds: string[];
  outcomeIds: string[];
}
/** Start from a native seed or saved edition and retain its entire document. */
export interface GrantInstallationDocument {
  name: string;
  stage: GrantInstallationStage;
  merchantDeploymentId: string | null;
  buyerDeploymentIds: string[];
  workorder: GrantObject;
  task: GrantObject;
  source: GrantObject;
  payment: GrantObject;
  receiving: GrantObject;
  assignments: GrantObject;
  checks: GrantInstallationCheck[];
  workshare?: GrantObject;
  workflowPeriods?: unknown;
  coordination?: GrantDeliveryCoordinationInput;
}
export interface GrantInstallationRef {
  id: string;
  revision: number;
  sha256: string;
}
export interface GrantDeliveryInstallation extends GrantInstallationRef {
  name: string;
  stage: GrantInstallationStage;
  sourceAvailable: boolean;
  sourceRecordsChanged: boolean;
  coordination: GrantDeliveryCoordination;
}
export interface GrantDeliveryPrerequisite {
  id: string;
  title: string;
  state: GrantCheckState;
}
export interface GrantDeliveryRow {
  key: string;
  installationId: string;
  installationName: string;
  revision: number;
  editionSha256: string;
  taskId: string;
  kind: 'CONFIGURATION' | 'ACCEPTANCE';
  title: string;
  criterion: string;
  stage: GrantInstallationStage;
  state: GrantCheckState | 'COMPLETE';
  required: boolean;
  owner: string;
  dueDate: GrantCivilDate | null;
  priority: GrantDeliveryPriority;
  dueStatus: GrantDeliveryDueStatus;
  done: boolean;
  retired: boolean;
  caseClosed: boolean;
  /** Open active work with no unfinished declared prerequisite. */
  ready: boolean;
  dependsOn: string[];
  waitingOn: GrantDeliveryPrerequisite[];
  sourceAvailable: boolean;
  sourceRecordsChanged: boolean;
  note: string;
  acceptanceOperator: string;
  /** Original check observedAt; inspect state for its acceptance outcome. */
  acceptedAt: string | null;
}
export interface GrantDeliveryQueue {
  schema: 'stellar-forge.sf47-delivery-queue.v1';
  asOfDate: GrantCivilDate;
  source: {
    caseId: string;
    caseName: string;
    caseVersion: number;
    caseState: string;
    planId: string;
    planRevision: number;
    planContentSha256: string;
    installationHeads: GrantInstallationRef[];
  };
  summary: {
    installations: number;
    tasks: number;
    open: number;
    overdue: number;
    dueToday: number;
    unassigned: number;
    waiting: number;
    ready: number;
    completed: number;
    changedInstallations: number;
  };
  owners: { owner: string; open: number }[];
  installations: GrantDeliveryInstallation[];
  rows: GrantDeliveryRow[];
  /** Native digest of the queue object before this field is added. */
  sha256: string;
}
export type GrantLedgerKind = 'contributors' | 'work' | 'invoices' | 'cash';
export interface GrantLedgerFile {
  id: string;
  filename: string;
  kind: GrantLedgerKind | 'source';
  format: 'csv' | 'tsv' | 'json' | 'binary';
  contentBase64: string;
  /** Native field to original column; null explicitly ignores that native field. */
  mapping?: Record<string, string | null>;
  defaults?: GrantObject;
  sourceUrl?: string;
  observedAt?: string | null;
  mediaType?: string;
}
export interface GrantLedgerDocument {
  schema: 'stellar-forge.sf47-ledger-intake.v1';
  title: string;
  files: GrantLedgerFile[];
}
export interface GrantLedgerFileMetadata extends Omit<GrantLedgerFile, 'contentBase64' | 'mapping' | 'defaults' | 'sourceUrl' | 'observedAt' | 'mediaType'> {
  mapping: Record<string, string | null>;
  defaults: GrantObject;
  sourceUrl: string;
  observedAt: string | null;
  mediaType: string;
  bytes: number;
  sha256: string;
}
export interface GrantLedgerFileView extends GrantLedgerFileMetadata {
  headers: string[];
  rowCount: number;
  unmappedColumns: string[];
}
export interface GrantLedgerInspection extends GrantLedgerFileView {
  sample: { row: number; data: GrantObject }[];
}
export interface GrantLedgerSummary {
  records: number;
  created: number;
  replaced: number;
  files: number;
  sourceBytes: number;
  byKind: Record<GrantLedgerKind, { create: number; replace: number }>;
}
export interface GrantLedgerHistoryEntry {
  sourceId: string;
  title: string;
  recordedAt: string;
  actor: string;
  documentSha256: string;
  originalCaseId: string;
  fromVersion: number;
  version: number;
  summary: GrantLedgerSummary;
  requestId: string;
}
export interface GrantLedgerRecordPreview {
  key: string;
  kind: GrantLedgerKind;
  action: 'contributor.save' | 'work.save' | 'invoice.save' | 'cash.record';
  mode: 'create' | 'replace';
  recordId: string | null;
  fileId: string;
  /** CSV/TSV positions include the header as row one; JSON starts at one. */
  rows: number[];
  before: GrantObject | null;
  after: GrantObject;
}
export interface GrantLedgerPreview {
  schema: 'stellar-forge.sf47-ledger-preview.v1';
  title: string;
  case: { id: string; version: number; name: string; state: string; mode: 'OPERATIONS' | 'WALKTHROUGH' };
  documentSha256: string;
  canApply: boolean;
  files: GrantLedgerFileView[];
  records: GrantLedgerRecordPreview[];
  errors: { code: string; message: string; file?: number; fileId?: string | null; key?: string; rows?: number[] }[];
  summary: GrantLedgerSummary;
  alreadyRecorded: GrantLedgerHistoryEntry | null;
  previewSha256: string;
}
export interface GrantLedgerPreviewInput { document: GrantLedgerDocument; expectedVersion?: number; }
export interface GrantLedgerApplyInput extends GrantOperationRequest {
  document: GrantLedgerDocument;
  expectedPreviewSha256: string;
}
export interface GrantLedgerRecordedRow {
  key: string;
  kind: GrantLedgerKind;
  fileId: string;
  rows: number[];
  recordId: string;
  version: number;
  mode: 'create' | 'replace';
}
export interface GrantLedgerReceipt {
  id: string;
  version: number;
  action: 'ledger.intake';
  requestId: string;
  documentSha256: string;
  sourceId: string;
  summary: GrantLedgerSummary;
  files: (GrantLedgerFileMetadata & { sourceId: string })[];
  records: GrantLedgerRecordedRow[];
}
export interface GrantLedgerRecorded {
  schema: 'stellar-forge.sf47-ledger-recorded.v1';
  title: string;
  recordedAt: string;
  actor: string;
  note: string;
  requestId: string;
  caseId: string;
  fromVersion: number;
  version: number;
  documentSha256: string;
  previewSha256: string;
  summary: GrantLedgerSummary;
  files: (GrantLedgerFileMetadata & { sourceId: string })[];
  records: GrantLedgerRecordedRow[];
  document: Omit<GrantLedgerDocument, 'files'> & { files: Omit<GrantLedgerFile, 'contentBase64'>[] };
}
export interface GrantLedgerOriginal {
  source: GrantObject;
  recorded: GrantLedgerRecorded;
  document: GrantLedgerDocument;
}
export interface GrantLedgerContract {
  schema: 'stellar-forge.sf47-ledger-intake.v1';
  case: GrantLedgerPreview['case'];
  limits: { files: number; sourceBytes: number; sourceRows: number; records: number };
  fields: Record<GrantLedgerKind, string[]>;
  templates: Record<GrantLedgerKind, Record<'csv' | 'tsv', string>>;
  intakes: GrantLedgerHistoryEntry[];
}

export interface GrantPerformanceSelection {
  caseId: string;
  startDate?: GrantCivilDate | null;
  endDate?: GrantCivilDate;
  expectedVersion?: number;
}
export interface GrantPerformancePeriod {
  startDate: GrantCivilDate | null;
  endDate: GrantCivilDate;
  workRecognition: 'COMPLETION_DATE';
  recordStateBasis: 'SELECTED_CASE_VERSION';
}
export interface GrantPerformanceAmounts {
  inUsd: string;
  outUsd: string;
  netUsd: string;
  grantReceiptsUsd: string;
  customerReceiptsUsd: string;
  invoicedUsd: string;
  paidUsd: string;
  openUsd: string;
  creditUsd: string;
}
export interface GrantPerformanceReceived extends GrantPerformancePeriod {
  reportSha256: string;
  sourceCaseId: string;
  sourceCaseVersion: number;
}
export interface GrantPerformanceReport extends GrantObject {
  schema: 'stellar-forge.sf47-performance.v1';
  selection: GrantPerformancePeriod;
  case: { id: string; name: string; version: number; state: string; mode: 'OPERATIONS' | 'WALKTHROUGH' };
  plan: { id: string; revision: number; name: string; contentSha256: string; sourceSha256: string; budgetUsd: string; plannedHours: string };
  finances: Record<'opening' | 'period' | 'closing', GrantPerformanceAmounts>;
  work: Record<'opening' | 'period' | 'closing', { recordedHours: string; acceptedHours: string; preawardHours: string }>;
  packages: GrantObject[];
  categories: GrantObject[];
  contributors: GrantObject[];
  invoices: GrantObject[];
  cash: GrantObject[];
  workRecords: GrantObject[];
  aging: { bucket: string; count: number; amountUsd: string }[];
  assets: GrantObject[];
  days: GrantObject[];
  sources: GrantObject[];
  recordsSha256: string;
  reportSha256: string;
  basis: string[];
}
export interface GrantPerformanceDownloadSelection extends GrantPerformanceSelection {
  endDate: GrantCivilDate;
  expectedVersion: number;
  expectedReportSha256: string;
}

export interface GrantSupplierAccountSelection extends GrantPerformanceSelection {
  contributorId?: string | null;
}
export interface GrantSupplierAccountPeriod extends GrantPerformancePeriod {
  contributorId: string | null;
}
export interface GrantSupplierAccountAmounts {
  invoicedUsd: string;
  paidUsd: string;
  openUsd: string;
  creditUsd: string;
  balanceUsd: string;
}
export interface GrantSupplierSummary {
  id: string; name: string; kind: string; contact: string; state: string;
  opening: GrantSupplierAccountAmounts;
  period: GrantSupplierAccountAmounts;
  closing: GrantSupplierAccountAmounts;
  work: { recordedHours: string; acceptedHours: string; preawardHours: string };
  workWithoutInvoiceLink: number;
  invoiceCount: number;
  disputedInvoices: number;
}
export interface GrantSupplierInvoiceLine {
  id: string; costId: string | null; description: string; amountUsd: string; workIds: string[];
}
export interface GrantSupplierInvoice extends GrantObject {
  id: string; contributorId: string; number: string; state: string;
  issuedDate: GrantCivilDate; dueDate: GrantCivilDate | null;
  totalUsd: string; lines: GrantSupplierInvoiceLine[];
  openingInvoicedUsd: string; periodInvoicedUsd: string; closingInvoicedUsd: string;
  openingPaidUsd: string; periodPaidUsd: string; closingPaidUsd: string;
  openUsd: string; creditUsd: string; balanceUsd: string;
  overdueDays: number; aging: string; future: boolean; inPeriod: boolean;
  sourceIds: string[]; sourceNote: string;
}
export interface GrantSupplierCashAllocation {
  invoiceId: string; amountUsd: string; invoiceNumber: string; invoiceState: string;
  contributorId: string; contributor: string; onSelectedAccount: boolean;
}
export interface GrantSupplierCash extends GrantObject {
  id: string; date: GrantCivilDate; state: string; direction: 'IN' | 'OUT'; category: string;
  amount: string; currency: string; network: string; asset: string;
  usdValue: string | null; externalRef: string; allocations: GrantSupplierCashAllocation[];
  accountAllocatedUsd: string; signedAccountPaidUsd: string; recognizedAccountPaidUsd: string;
  otherAllocatedUsd: string; unallocatedUsd: string | null;
  inPeriod: boolean; future: boolean; includedInUsd: boolean;
  usdBasis: 'VOID' | 'TESTNET' | 'UNVALUED' | 'RECORDED_USD';
  sourceIds: string[]; valuationSourceIds: string[]; sourceNote: string;
}
export interface GrantSupplierWork extends GrantObject {
  id: string; contributorId: string; description: string; state: string;
  startDate: GrantCivilDate; endDate: GrantCivilDate; hours: string; costId: string | null;
  fundingBasis: string; inPeriod: boolean; future: boolean; withoutInvoiceLink: boolean;
  invoiceLinks: { invoiceId: string; number: string; state: string; issuedDate: GrantCivilDate; lineId: string; description: string; amountUsd: string }[];
  sourceIds: string[]; sourceNote: string;
}
export interface GrantSupplierActivity {
  date: GrantCivilDate; kind: 'INVOICE' | 'PAYMENT' | 'REFUND'; recordId: string; label: string;
  invoicedUsd: string; paidUsd: string; balanceChangeUsd: string; runningBalanceUsd: string; sourceIds: string[];
}
export interface GrantSupplierAccountReport extends GrantObject {
  schema: 'stellar-forge.sf47-supplier-account.v1';
  selection: GrantSupplierAccountPeriod;
  case: GrantPerformanceReport['case'];
  plan: { id: string; revision: number; name: string; contentSha256: string };
  account: GrantObject | null;
  accounts: GrantSupplierSummary[];
  balances: Record<'opening' | 'period' | 'closing', GrantSupplierAccountAmounts>;
  workTotals: GrantPerformanceReport['work'];
  invoices: GrantSupplierInvoice[];
  work: GrantSupplierWork[];
  cash: GrantSupplierCash[];
  activity: GrantSupplierActivity[];
  aging: { bucket: string; count: number; amountUsd: string }[];
  sources: GrantObject[];
  attention: Record<'receivedInvoiceIds' | 'disputedInvoiceIds' | 'overdueInvoiceIds' | 'creditInvoiceIds' | 'workWithoutInvoiceLinkIds' | 'excludedCashIds', string[]>;
  recordsSha256: string; reportSha256: string; basis: string[];
}
export interface GrantSupplierAccountReceived extends GrantSupplierAccountPeriod {
  reportSha256: string; sourceCaseId: string; sourceCaseVersion: number;
}
export interface GrantSupplierAccountDownloadSelection extends GrantSupplierAccountSelection {
  endDate: GrantCivilDate; expectedVersion: number; expectedReportSha256: string;
}

export interface GrantDeliveryQueueSelection { caseId: string; asOfDate?: GrantCivilDate; }
export interface GrantInstallationSelection {
  expectedVersion: number;
  installationId: string | null;
  expectedRevision: number;
}
export interface GrantInstallationPreviewInput extends GrantInstallationSelection {
  document: GrantInstallationDocument;
}
export interface GrantOperationRequest {
  expectedVersion: number;
  requestId: string;
  actor: string;
  note?: string;
}
export interface GrantInstallationSaveInput extends GrantInstallationPreviewInput, GrantOperationRequest {
  note: string;
  expectedPreviewSha256: string;
}
export interface GrantInstallationPreview {
  schema: 'stellar-forge.sf47-installation.v1';
  installationId: string | null;
  expectedRevision: number;
  source: GrantObject;
  document: GrantInstallationDocument;
  snapshot: GrantObject;
  report: GrantObject;
  previous: GrantInstallationRef | null;
  changes: GrantObject[];
  previewSha256: string;
}
export interface GrantInstallationEdition extends GrantInstallationRef {
  version: number;
  createdAt: string;
  actor: string;
  note: string;
  preview: GrantInstallationPreview;
  current: { available: boolean; selectedRecordsChanged: boolean; caseVersion: number };
}
export interface GrantInstallationSeed extends GrantObject {
  document: GrantInstallationDocument;
  source: GrantObject;
}
export interface GrantInstallationSaveReceipt extends GrantObject {
  id: string;
  version: number;
  action: 'installation.save';
  kind: 'installation';
  recordId: string;
  revision: number;
  sha256: string;
}
export interface GrantCaseView extends GrantObject {
  program: { id: string; name: string; version: number; state: string; [key: string]: unknown };
}
export interface GrantCaseImportReceipt extends GrantObject {
  id: string;
  version: number;
  action: 'import';
  planId: string;
  mode: 'OPERATIONS' | 'WALKTHROUGH';
  /** Present when the imported file is a complete dated delivery queue handover. */
  deliveryQueue?: { asOfDate: GrantCivilDate; sha256: string };
  performance?: GrantPerformanceReceived;
  supplierAccount?: GrantSupplierAccountReceived;
  selectedInstallation?: GrantInstallationRef;
}
export interface GrantWorkshareSourceSelection {
  expectedVersion: number;
  sourceId: string;
  expectedSourceSha256: string;
  packetSourceId?: string | null;
  expectedPacketSha256?: string | null;
}
export interface GrantWorkflowSourceSelection {
  expectedVersion: number;
  sourceId: string;
  expectedSourceSha256: string;
}
export interface GrantModelSaveInput extends GrantOperationRequest {
  inputs: GrantObject;
  expectedPreviewSha256: string;
}
export interface GrantForecastSource extends GrantObject {
  programId: string;
  version: number;
  planId: string;
  planRevision: number;
  planContentSha256: string;
  planSourceSha256: string;
  businessSha256: string;
  factsSha256: string;
}
export interface GrantForecastPreview extends GrantObject {
  schema: 'stellar-forge.sf47-operating-forecast.v1';
  engineVersion: 1;
  source: GrantForecastSource;
  inputs: GrantObject;
  report: GrantObject;
  previewSha256: string;
}
export interface GrantSavedForecast extends GrantForecastPreview {
  id: string;
  createdAt: string;
  actor: string;
  note: string;
  snapshot: GrantObject;
  sha256: string;
  current?: GrantObject;
}
export type GrantPortfolioStatus = 'READY' | 'INCOMPLETE' | 'HORIZON_EXCEEDED';
/** Decimal strings preserve the original native allocation's precision. */
export type GrantPortfolioHours = string;
export type GrantWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export interface GrantPortfolioCalendar {
  startDate: GrantCivilDate;
  horizonDays: number;
  weekdays: GrantWeekday[];
  holidays: GrantCivilDate[];
  extraWorkingDates: GrantCivilDate[];
}
export interface GrantPortfolioResource {
  id: string;
  name: string;
  /** Monday through Sunday. null is unentered; "0" is unavailable. */
  hoursByWeekday: [GrantPortfolioHours | null, GrantPortfolioHours | null, GrantPortfolioHours | null, GrantPortfolioHours | null, GrantPortfolioHours | null, GrantPortfolioHours | null, GrantPortfolioHours | null];
  hoursByDate: Record<GrantCivilDate, GrantPortfolioHours>;
  note: string;
}
export interface GrantPortfolioTask {
  id: string;
  effortHours: Record<string, GrantPortfolioHours | null>;
  dependsOn: string[];
  releaseDate: GrantCivilDate | null;
  dueDate: GrantCivilDate | null;
  minBusinessDays: number;
  priority: number;
  note: string;
}
export interface GrantPortfolioInstallationRef {
  installationId: string;
  installationRevision: number;
  installationSha256: string;
}
export interface GrantPortfolioInstallationSelection extends GrantPortfolioInstallationRef {
  /** The existing commercial task ID from the saved Forecast. */
  taskId: string;
}
export interface GrantPortfolioInstallationPhase {
  phaseId: string;
  /** Explicit remaining work; acceptance observations never fill this value. */
  remainingHours: GrantPortfolioHours | null;
  effortHours: Record<string, GrantPortfolioHours | null>;
  /** Retains the original phase dependencies. */
  dependsOn: string[];
  releaseDate: GrantCivilDate | null;
  dueDate: GrantCivilDate | null;
  minBusinessDays: number;
  /** null inherits the aggregate task priority; every integer, including 100, is explicit. */
  priority: number | null;
  note: string;
}
export interface GrantPortfolioInstallationPlan extends GrantPortfolioInstallationSelection {
  /** Reviewed boundary phases and their ancestors define the commercial delivery window. */
  deliveryPhaseIds: string[];
  deliveryBoundaryNote: string;
  /** Every original phase remains present, including support after delivery. */
  phases: GrantPortfolioInstallationPhase[];
  note: string;
}
export interface GrantPortfolioInstallationSourceSelection extends GrantPortfolioInstallationRef {
  /** Original Workshare case ID. */
  caseId: string;
  planSha256: string;
  sourceId: string;
  sourceSha256: string;
  packetSourceId: string | null;
  packetSha256: string | null;
}
export interface GrantPortfolioInstallationSource {
  schema: 'stellar-forge.sf47-portfolio-installations.v1';
  selections: GrantPortfolioInstallationSourceSelection[];
  sha256: string;
}
export interface GrantPortfolioOriginalPhase {
  phaseId: string;
  title: string;
  quotedHours: GrantPortfolioHours;
  /** Complete original owner value, retained without coercing the source into text. */
  owner: unknown;
  dependsOn: string[];
  businessDays: number | null;
  terms: GrantObject;
  checkId: string;
  checkState: GrantCheckState;
  checkOperator: string;
  checkObservedAt: string | null;
  coordinationOwner: string;
  coordinationDueDate: GrantCivilDate | null;
  coordinationPriority: GrantDeliveryPriority;
}
export interface GrantPortfolioAvailableInstallation extends GrantPortfolioInstallationSourceSelection {
  name: string;
  stage: GrantInstallationStage;
  title: string;
  /** Complete original customer value from the selected Workshare plan. */
  customer: unknown;
  quotedHours: GrantPortfolioHours;
  commercial: GrantObject;
  schedule: GrantObject;
  workorder: GrantObject;
  matchingTaskIds: string[];
  phases: GrantPortfolioOriginalPhase[];
  unavailable?: never;
}
export interface GrantPortfolioUnavailableInstallation extends GrantPortfolioInstallationRef {
  name: string;
  stage: GrantInstallationStage;
  matchingTaskIds: [];
  phases: [];
  unavailable: { code: string; message: string };
}
export type GrantPortfolioInstallationCandidate =
  | GrantPortfolioAvailableInstallation
  | GrantPortfolioUnavailableInstallation;
export interface GrantPortfolioInstallationPhaseResult {
  phaseId: string;
  scheduleTaskId: string;
  title: string;
  quotedHours: GrantPortfolioHours;
  remainingHours: GrantPortfolioHours | null;
  owner: unknown;
  checkState: GrantCheckState;
  checkOperator: string;
  checkObservedAt: string | null;
  coordinationOwner: string;
  dependsOn: string[];
  deliveryScope: boolean;
  startDate: GrantCivilDate | null;
  finishDate: GrantCivilDate | null;
  dueDate: GrantCivilDate | null;
  effortHours: Record<string, GrantPortfolioHours | null>;
  /** Result field name; the editable input uses minBusinessDays. */
  minimumBusinessDays: number;
}
export interface GrantPortfolioInstallationPlanResult extends GrantPortfolioInstallationSelection {
  caseId: string;
  planSha256: string;
  quotedHours: GrantPortfolioHours;
  remainingHours: GrantPortfolioHours;
  deliveryPhaseIds: string[];
  deliveryBoundaryNote: string;
  deliveryPhaseClosure: string[];
  deliveryStartDate: GrantCivilDate | null;
  deliveryFinishDate: GrantCivilDate | null;
  allWorkFinishDate: GrantCivilDate | null;
  phases: GrantPortfolioInstallationPhaseResult[];
}
export interface GrantPortfolioSeedOptions {
  installationSelections?: GrantPortfolioInstallationSelection[];
  /** Complete editable draft. Seed changes base phase plans and preserves explicit alternative overrides. */
  inputs?: GrantPortfolioInputs;
}
export interface GrantPortfolioSaveReceipt extends GrantObject {
  id: string;
  version: number;
  action: 'portfolio.save';
  kind: 'portfolio';
  recordId: string;
}
export interface GrantForecastSaveReceipt extends GrantObject {
  id: string;
  version: number;
  action: 'forecast.save';
  kind: 'forecast';
  recordId: string;
}
export interface GrantPortfolioAlternative {
  id: string;
  name: string;
  note: string;
  /** An authored override replaces the complete field; omitted fields inherit the base. */
  calendar?: GrantPortfolioCalendar;
  resources?: GrantPortfolioResource[];
  tasks?: GrantPortfolioTask[];
  /** Complete replacement; [] uses aggregate tasks. Seed preserves this authored override. */
  installationPlans?: GrantPortfolioInstallationPlan[];
}
export interface GrantPortfolioInputs extends GrantObject {
  schema: 'stellar-forge.sf47-portfolio.v1';
  name: string;
  forecastId: string;
  forecastSha256: string;
  calendar: GrantPortfolioCalendar;
  resources: GrantPortfolioResource[];
  tasks: GrantPortfolioTask[];
  installationPlans?: GrantPortfolioInstallationPlan[];
  alternatives: GrantPortfolioAlternative[];
  note: string;
}
export interface GrantPortfolioForecastRef {
  id: string;
  sha256: string;
  previewSha256: string;
  source: GrantForecastSource;
}
export interface GrantPortfolioSourceTask extends GrantObject {
  id: string;
  sourceKind: string;
  sourceId: string;
  title: string;
  remainingHours: GrantPortfolioHours;
  startDate: GrantCivilDate | null;
  endDate: GrantCivilDate | null;
  tranche: number | null;
  remainingCostUsd: string | null;
  scope: string;
  sourceIds: string[];
  timing?: GrantObject;
  nativePricing?: GrantObject;
  nativeReceipts?: GrantObject[];
  currencyValuation?: GrantObject;
}
export interface GrantPortfolioSeed extends GrantObject {
  inputs: GrantPortfolioInputs;
  baseForecast: GrantPortfolioForecastRef;
  sourceTasks: GrantPortfolioSourceTask[];
  originalCapacity: GrantObject;
  originalAssignments: GrantObject[];
  installationCandidates?: GrantPortfolioInstallationCandidate[];
  installationSource?: GrantPortfolioInstallationSource;
}
export interface GrantPortfolioFinding {
  code: string;
  field: string;
  message: string;
}
export interface GrantPortfolioChosenDates extends GrantObject {
  taskId: string;
  sourceKind: string;
  sourceId: string;
  oldStartDate: GrantCivilDate | null;
  oldEndDate: GrantCivilDate | null;
  startDate: GrantCivilDate;
  endDate: GrantCivilDate;
  startShiftDays: number | null;
  endShiftDays: number | null;
}
export interface GrantPortfolioAlternativeSummary extends GrantObject {
  phaseLateTasks?: number;
  sourceTasks?: number;
}
export interface GrantPortfolioAlternativeResult extends GrantObject {
  id: string;
  name: string;
  note: string;
  status: GrantPortfolioStatus;
  findings: GrantPortfolioFinding[];
  summary: GrantPortfolioAlternativeSummary | null;
  schedule: GrantObject | null;
  chosenDates: GrantPortfolioChosenDates[];
  forecast: { inputs: GrantObject; previewSha256: string; report: GrantObject } | null;
  installationPlans?: GrantPortfolioInstallationPlanResult[];
}
export interface GrantPortfolioReport extends GrantObject {
  sourceTasks: GrantPortfolioSourceTask[];
  baseline: GrantObject;
  alternatives: GrantPortfolioAlternativeResult[];
  comparison: GrantObject[];
  comparisonBasis: string;
  paymentTimingBasis: string;
  installationCandidates?: GrantPortfolioAvailableInstallation[];
}
export interface GrantPortfolioPreview extends GrantObject {
  schema: 'stellar-forge.sf47-portfolio.v1';
  engineVersion: 1;
  source: GrantForecastSource;
  baseForecast: GrantPortfolioForecastRef;
  inputs: GrantPortfolioInputs;
  report: GrantPortfolioReport;
  installationSource?: GrantPortfolioInstallationSource;
  previewSha256: string;
}
export interface GrantPortfolioCurrentSource extends GrantObject {
  programId: string;
  version: number;
  sourceChanged: boolean;
  retainedOriginalProgramId: string;
  installationSourceChanged?: boolean;
}
export interface GrantSavedPortfolio extends GrantPortfolioPreview {
  id: string;
  version: number;
  createdAt: string;
  actor: string;
  note: string;
  snapshot: GrantObject;
  baseForecastSnapshot: GrantObject;
  sha256: string;
  current?: GrantPortfolioCurrentSource;
}
export interface GrantPortfolioSelection extends GrantObject {
  inputs: GrantObject;
  selection: {
    portfolioId: string;
    portfolioSha256: string;
    alternativeId: string;
    baseForecast: GrantPortfolioForecastRef;
    source: GrantForecastSource;
    previewSha256: string;
    chosenDates: GrantPortfolioChosenDates[];
    installationSource?: GrantPortfolioInstallationSource;
    installationPlans?: GrantPortfolioInstallationPlanResult[];
  };
}

/** Two explicit retained revisions; omit toPlanId to compare within the same plan. */
export interface GrantPlanComparisonSelection {
  planId: string;
  fromRevision: number;
  toRevision: number;
  toPlanId?: string;
  expectedComparisonSha256?: string;
}
export interface GrantPlanComparisonExportSelection extends GrantPlanComparisonSelection {
  expectedComparisonSha256: string;
}
export interface GrantPlanComparisonIdentity {
  id: string;
  name: string;
  revision: number;
  savedAt: string;
  note: string;
  contentSha256: string;
  reportSha256: string;
  calculatorSha256: string | null;
  source: GrantObject & { sha256: string; filename: string; url: string };
}
export interface GrantPlanComparisonChange {
  path: string;
  kind: 'added' | 'removed' | 'changed';
  beforePresent: boolean;
  afterPresent: boolean;
  before: unknown;
  after: unknown;
}
export interface GrantPlanComparisonRow {
  id: string;
  state: 'added' | 'removed' | 'changed' | 'unchanged';
  before: GrantObject | null;
  after: GrantObject | null;
  changes: GrantPlanComparisonChange[];
}
export interface GrantPlanComparisonMetric {
  id: string;
  label: string;
  unit: string;
  before: string | number | null;
  after: string | number | null;
  /** Exact decimal after minus before. Null means at least one side is unset or absent. */
  delta: string | null;
  path: string;
}
export interface GrantPlanComparisonDay {
  day: number;
  before: GrantObject | null;
  after: GrantObject | null;
  delta: Record<'accruedUsd' | 'plannedOutflowUsd' | 'conditionalInflowUsd' | 'cashGapUsd' | 'gapAfterCapitalInputUsd' | 'accruedUnpaidUsd', string | null>;
}
export interface GrantPlanComparison {
  schema: 'stellar-forge.sf47.plan-comparison.v1';
  comparisonSha256: string;
  before: GrantPlanComparisonIdentity;
  after: GrantPlanComparisonIdentity;
  basis: {
    delta: 'after - before';
    reportBasis: string;
    dailyBasis: string;
    sameOriginalSource: boolean;
    sameCalculator: boolean;
    sameInputs: boolean;
  };
  summary: {
    inputChanges: number;
    reportChanges: number;
    groups: Record<'workPackages' | 'milestones' | 'contributors' | 'delivery', Record<'added' | 'removed' | 'changed' | 'unchanged', number>>;
    modeledDaysBefore: number;
    modeledDaysAfter: number;
  };
  metrics: GrantPlanComparisonMetric[];
  groups: Record<'workPackages' | 'milestones' | 'contributors' | 'delivery', GrantPlanComparisonRow[]>;
  changes: Array<GrantPlanComparisonChange & { area: 'scenario' | 'planning' | 'report' }>;
  days: GrantPlanComparisonDay[];
  snapshots: Record<'before' | 'after', GrantObject & { scenario: GrantObject; planning: GrantObject; report: GrantObject }>;
}

export interface GrantReadSelection {
  planId?: string;
  caseId?: string;
  forecastId?: string;
  portfolioId?: string;
  reviewId?: string;
  revision?: number;
  after?: number;
  limit?: number;
  asOfDate?: GrantCivilDate;
}
export type GrantOtherReadView =
  | 'plans' | 'plan' | 'plan-history' | 'cases' | 'case-report' | 'case-history' | 'expenses'
  | 'forecasts' | 'forecast' | 'portfolios' | 'portfolio' | 'review' | 'completion';
export interface GrantDownloadSelections {
  plan: { planId: string };
  'plan-comparison': GrantPlanComparisonExportSelection;
  'plan-comparison-report': GrantPlanComparisonExportSelection;
  'plan-comparison-changes': GrantPlanComparisonExportSelection;
  'plan-comparison-impact': GrantPlanComparisonExportSelection;
  'plan-comparison-daily': GrantPlanComparisonExportSelection;
  scenario: { planId: string };
  'daily-csv': { planId: string };
  'costs-csv': { planId: string };
  case: { caseId: string };
  'expense-attributions': { caseId: string };
  'expense-sources': { caseId: string };
  'expense-html': { caseId: string };
  forecast: { caseId: string; forecastId: string };
  portfolio: { caseId: string; portfolioId: string };
  'delivery-queue': GrantDeliveryQueueSelection;
  performance: GrantPerformanceDownloadSelection;
  'supplier-account': GrantSupplierAccountDownloadSelection;
  installation: { caseId: string; installationId: string; revision: number };
  commercial: { caseId: string; billingId: string };
  source: { caseId: string; sourceId: string };
  completion: { caseId: string; reviewId: string };
  cohort: { caseId: string; reviewId: string };
  implementation: { caseId: string; reviewId: string };
  'implementation-original': { caseId: string; sourceId: string; sha256: string };
}

export function inspectGrantAgentBinding(input: GrantBindingInput): Promise<GrantBinding>;
export function readGrantAgentFile(filename: string, maximum?: number, privateOnly?: boolean): Promise<Buffer>;

export class GrantWorkspaceClient {
  constructor(binding: GrantBinding);
  readonly summary: GrantClientSummary;
  inspect(): Promise<GrantInspection>;
  open(selection?: { expectedSelectionSha256?: string }): Promise<GrantInspection>;
  browser(): Promise<{ schema: typeof GRANT_AGENT_SCHEMA; url: string; original: GrantObject }>;
  read(view: 'plan-comparison', selection: GrantPlanComparisonSelection): Promise<GrantJsonResponse<GrantPlanComparison>>;
  read(view: 'ledger-intake', selection: { caseId: string }): Promise<GrantJsonResponse<GrantLedgerContract>>;
  read(view: 'ledger-intake-original', selection: { caseId: string; sourceId: string }): Promise<GrantJsonResponse<GrantLedgerOriginal>>;
  read(view: 'performance', selection: GrantPerformanceSelection): Promise<GrantJsonResponse<GrantPerformanceReport>>;
  read(view: 'supplier-account', selection: GrantSupplierAccountSelection): Promise<GrantJsonResponse<GrantSupplierAccountReport>>;
  read(view: 'delivery-queue', selection: GrantDeliveryQueueSelection): Promise<GrantJsonResponse<GrantDeliveryQueue>>;
  read(view: 'case', selection: { caseId: string }): Promise<GrantJsonResponse<GrantCaseView>>;
  read(view: 'expenses', selection: { caseId: string }): Promise<GrantJsonResponse<GrantExpenseDashboard>>;
  read(view: 'installations', selection: { caseId: string }): Promise<GrantJsonResponse<{ installations: GrantObject[] }>>;
  read(view: 'installation', selection: { caseId: string; installationId: string; revision?: number }): Promise<GrantJsonResponse<GrantInstallationEdition>>;
  read(view: 'installation-history', selection: { caseId: string; installationId: string; before?: number; limit?: number }): Promise<GrantJsonResponse<{ editions: GrantObject[]; nextBefore: number | null }>>;
  read(view: 'forecast', selection: { caseId: string; forecastId: string }): Promise<GrantJsonResponse<GrantSavedForecast>>;
  read(view: 'portfolio', selection: { caseId: string; portfolioId: string }): Promise<GrantJsonResponse<GrantSavedPortfolio>>;
  read<T = GrantObject>(view: GrantOtherReadView, selection?: GrantReadSelection): Promise<GrantJsonResponse<T>>;
  plan<T = GrantObject>(action: 'estimate' | 'save' | 'restore' | 'clone', planId: string, body: GrantObject): Promise<GrantJsonResponse<T>>;
  createCase<T = GrantObject>(body: { planId: string; selectedRevision: number; expectedContentSha256: string; name: string; mode: 'OPERATIONS' | 'WALKTHROUGH'; calendarStart?: GrantCivilDate; actor: string; requestId: string }): Promise<GrantJsonResponse<T>>;
  command<T = GrantObject>(caseId: string, body: GrantOperationRequest & { action: GrantCaseAction; data: GrantObject }): Promise<GrantJsonResponse<T>>;
  statementPreview(caseId: string, expectedVersion: number, inputs: GrantStatementInput): Promise<GrantJsonResponse<GrantStatementPreview>>;
  statementReceive(caseId: string, body: GrantOperationRequest & { inputs: GrantStatementInput; expectedPreviewSha256: string }): Promise<GrantJsonResponse<GrantStatementReceipt>>;
  ledgerIntakeInspect(caseId: string, file: GrantLedgerFile): Promise<GrantJsonResponse<GrantLedgerInspection>>;
  ledgerIntakePreview(caseId: string, body: GrantLedgerPreviewInput): Promise<GrantJsonResponse<GrantLedgerPreview>>;
  ledgerIntakeApply(caseId: string, body: GrantLedgerApplyInput): Promise<GrantJsonResponse<GrantLedgerReceipt>>;
  forecastPreview<T = GrantForecastPreview>(caseId: string, expectedVersion: number, inputs: GrantObject): Promise<GrantJsonResponse<T>>;
  forecastSave<T = GrantForecastSaveReceipt>(caseId: string, body: GrantModelSaveInput): Promise<GrantJsonResponse<T>>;
  portfolioSeed<T = GrantPortfolioSeed>(caseId: string, expectedVersion: number, forecastId: string, options?: GrantPortfolioSeedOptions): Promise<GrantJsonResponse<T>>;
  portfolioPreview<T = GrantPortfolioPreview>(caseId: string, expectedVersion: number, inputs: GrantObject): Promise<GrantJsonResponse<T>>;
  portfolioSave<T = GrantPortfolioSaveReceipt>(caseId: string, body: GrantModelSaveInput): Promise<GrantJsonResponse<T>>;
  portfolioSelection<T = GrantPortfolioSelection>(caseId: string, expectedVersion: number, portfolioId: string, alternativeId: string): Promise<GrantJsonResponse<T>>;
  installationSeed(caseId: string, expectedVersion: number): Promise<GrantJsonResponse<GrantInstallationSeed>>;
  installationWorkshares<T = GrantObject>(caseId: string, body: GrantWorkshareSourceSelection): Promise<GrantJsonResponse<T>>;
  installationWorkshareSeed(caseId: string, body: GrantWorkshareSourceSelection & GrantInstallationSelection & { workshareCaseId: string; document?: GrantInstallationDocument }): Promise<GrantJsonResponse<GrantInstallationSeed>>;
  installationWorkflows<T = GrantObject>(caseId: string, body: GrantWorkflowSourceSelection): Promise<GrantJsonResponse<T>>;
  installationWorkflowSeed(caseId: string, body: GrantWorkflowSourceSelection & GrantInstallationSelection & { cycleIds: string[]; document?: GrantInstallationDocument }): Promise<GrantJsonResponse<GrantInstallationSeed>>;
  installationPreview(caseId: string, body: GrantInstallationPreviewInput): Promise<GrantJsonResponse<GrantInstallationPreview>>;
  installationSave(caseId: string, body: GrantInstallationSaveInput): Promise<GrantJsonResponse<GrantInstallationSaveReceipt>>;
  commercialConnections(): Promise<GrantJsonResponse<GrantCommercialConnections>>;
  commercialConfigureConnection<T = GrantObject>(body: GrantCommercialConnectionInput): Promise<GrantJsonResponse<T>>;
  commercialCustomers(endpointId: string): Promise<GrantJsonResponse<GrantCommercialCustomers>>;
  commercialList(caseId: string): Promise<GrantJsonResponse<GrantCommercialList>>;
  commercialDetail(caseId: string, billingId: string): Promise<GrantJsonResponse<GrantCommercialPrepared>>;
  commercialSchedule(caseId: string, body: GrantCommercialScheduleInput): Promise<GrantJsonResponse<GrantCommercialSchedule>>;
  /** A new request may correct unbilled selections before a native command is retained. */
  commercialPrepare(caseId: string, body: GrantCommercialPrepareInput): Promise<GrantJsonResponse<GrantCommercialPrepared>>;
  /** Native request identity is retained once for each original obligation and action. */
  commercialDraft(caseId: string, billingId: string, milestoneId: string, body: { actor: string }): Promise<GrantJsonResponse<GrantCommercialCommandResult>>;
  commercialPreview(caseId: string, billingId: string, milestoneId: string): Promise<GrantJsonResponse<GrantCommercialIssuePreview>>;
  commercialIssue(caseId: string, billingId: string, milestoneId: string, body: { actor: string; expectedIssuePreviewSha256: string }): Promise<GrantJsonResponse<GrantCommercialCommandResult>>;
  commercialRefresh(caseId: string, billingId: string): Promise<GrantJsonResponse<GrantCommercialPrepared>>;
  cohortSeed<T = GrantObject>(caseId: string, expectedVersion: number, tranche: 2 | 3): Promise<GrantJsonResponse<T>>;
  cohortPreview<T = GrantObject>(caseId: string, expectedVersion: number, inputs: GrantObject): Promise<GrantJsonResponse<T>>;
  cohortPrepare<T = GrantObject>(caseId: string, body: GrantModelSaveInput): Promise<GrantJsonResponse<T>>;
  implementationSource<T = GrantObject>(caseId: string, expectedVersion: number, sourceId: string, asOfAt?: string): Promise<GrantJsonResponse<T>>;
  implementationPreview<T = GrantObject>(caseId: string, expectedVersion: number, inputs: GrantObject): Promise<GrantJsonResponse<T>>;
  implementationPrepare<T = GrantObject>(caseId: string, body: GrantModelSaveInput): Promise<GrantJsonResponse<T>>;
  completionSeed<T = GrantObject>(caseId: string, expectedVersion: number, tranche: 1 | 2 | 3): Promise<GrantJsonResponse<T>>;
  completionPreview<T = GrantObject>(caseId: string, expectedVersion: number, inputs: GrantObject): Promise<GrantJsonResponse<T>>;
  completionSave<T = GrantObject>(caseId: string, body: GrantOperationRequest & { inputs: GrantObject }): Promise<GrantJsonResponse<T>>;
  completionPrepare<T = GrantObject>(caseId: string, body: GrantOperationRequest & GrantObject): Promise<GrantJsonResponse<T>>;
  completionExtension<T = GrantObject>(caseId: string, body: GrantOperationRequest & GrantObject): Promise<GrantJsonResponse<T>>;
  completionSubmit<T = GrantObject>(caseId: string, body: GrantOperationRequest & GrantObject): Promise<GrantJsonResponse<T>>;
  completionDecision<T = GrantObject>(caseId: string, body: GrantOperationRequest & GrantObject): Promise<GrantJsonResponse<T>>;
  supportPreview<T = GrantObject>(caseId: string, expectedVersion: number, bytes: Buffer, filename: string): Promise<GrantJsonResponse<T>>;
  supportReceive<T = GrantObject>(caseId: string, bytes: Buffer, body: GrantOperationRequest & GrantObject): Promise<GrantJsonResponse<T>>;
  expensePreview(caseId: string, expectedVersion: number, bytes: Buffer, filename: string): Promise<GrantJsonResponse<GrantExpensePreview>>;
  expenseReceive(caseId: string, bytes: Buffer, body: GrantOperationRequest & { filename: string; expectedPreviewSha256: string }): Promise<GrantJsonResponse<GrantExpenseReceipt>>;
  expenseSave(caseId: string, body: GrantOperationRequest & { data: GrantExpenseAllocationInput }): Promise<GrantJsonResponse<GrantExpenseReceipt>>;
  expenseTransition(caseId: string, action: GrantExpenseTransition, body: GrantOperationRequest & { note: string; id: string; expectedContentSha256: string }): Promise<GrantJsonResponse<GrantExpenseReceipt>>;
  expenseRequest(caseId: string, body: GrantExpenseRequest): Promise<GrantJsonResponse<GrantExpenseRequestState>>;
  buyerPreview<T = GrantObject>(caseId: string, expectedVersion: number, bytes: Buffer, filename: string): Promise<GrantJsonResponse<T>>;
  buyerReceive<T = GrantObject>(caseId: string, bytes: Buffer, body: GrantOperationRequest & GrantObject): Promise<GrantJsonResponse<T>>;
  download<K extends keyof GrantDownloadSelections>(kind: K, selection: GrantDownloadSelections[K]): Promise<GrantNativeResponse>;
  importBundle(kind: 'case', bytes: Buffer, body: { name: string; requestId: string; actor: string }): Promise<GrantJsonResponse<GrantCaseImportReceipt>>;
  importBundle<T = GrantObject>(kind: 'plan', bytes: Buffer, body: { name: string; requestId: string; actor?: string }): Promise<GrantJsonResponse<T>>;
  importScenario<T = GrantObject>(bytes: Buffer, body: GrantObject): Promise<GrantJsonResponse<T>>;
  attach<T = GrantObject>(caseId: string, bytes: Buffer, body: GrantOperationRequest & GrantObject): Promise<GrantJsonResponse<T>>;
  intake<T = GrantObject>(bytes: Buffer, body: GrantObject): Promise<GrantJsonResponse<T>>;
  detach(expectedInstanceId?: string): Promise<GrantCloseResult>;
  close(): Promise<GrantCloseResult>;
}
