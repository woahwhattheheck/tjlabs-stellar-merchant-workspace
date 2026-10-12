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
  | 'cash.record' | 'cash.void' | 'award.save' | 'deployment.save'
  | 'purchase.record' | 'purchase.observe' | 'purchase.void' | 'outcome.save'
  | 'review' | 'close' | 'reopen' | 'cohort.prepare' | 'installation.save' | 'implementation.prepare'
  | 'completion.save' | 'completion.prepare' | 'completion.extension' | 'completion.submit' | 'completion.decision';

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
  | 'plans' | 'plan' | 'plan-history' | 'cases' | 'case-report' | 'case-history'
  | 'forecasts' | 'forecast' | 'portfolios' | 'portfolio' | 'review' | 'completion';
export interface GrantDownloadSelections {
  plan: { planId: string };
  scenario: { planId: string };
  'daily-csv': { planId: string };
  'costs-csv': { planId: string };
  case: { caseId: string };
  forecast: { caseId: string; forecastId: string };
  portfolio: { caseId: string; portfolioId: string };
  'delivery-queue': GrantDeliveryQueueSelection;
  performance: GrantPerformanceDownloadSelection;
  installation: { caseId: string; installationId: string; revision: number };
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
  read(view: 'performance', selection: GrantPerformanceSelection): Promise<GrantJsonResponse<GrantPerformanceReport>>;
  read(view: 'delivery-queue', selection: GrantDeliveryQueueSelection): Promise<GrantJsonResponse<GrantDeliveryQueue>>;
  read(view: 'case', selection: { caseId: string }): Promise<GrantJsonResponse<GrantCaseView>>;
  read(view: 'installations', selection: { caseId: string }): Promise<GrantJsonResponse<{ installations: GrantObject[] }>>;
  read(view: 'installation', selection: { caseId: string; installationId: string; revision?: number }): Promise<GrantJsonResponse<GrantInstallationEdition>>;
  read(view: 'installation-history', selection: { caseId: string; installationId: string; before?: number; limit?: number }): Promise<GrantJsonResponse<{ editions: GrantObject[]; nextBefore: number | null }>>;
  read<T = GrantObject>(view: GrantOtherReadView, selection?: GrantReadSelection): Promise<GrantJsonResponse<T>>;
  plan<T = GrantObject>(action: 'estimate' | 'save' | 'restore' | 'clone', planId: string, body: GrantObject): Promise<GrantJsonResponse<T>>;
  createCase<T = GrantObject>(body: { planId: string; selectedRevision: number; expectedContentSha256: string; name: string; mode: 'OPERATIONS' | 'WALKTHROUGH'; calendarStart?: GrantCivilDate; actor: string; requestId: string }): Promise<GrantJsonResponse<T>>;
  command<T = GrantObject>(caseId: string, body: GrantOperationRequest & { action: GrantCaseAction; data: GrantObject }): Promise<GrantJsonResponse<T>>;
  forecastPreview<T = GrantObject>(caseId: string, expectedVersion: number, inputs: GrantObject): Promise<GrantJsonResponse<T>>;
  forecastSave<T = GrantObject>(caseId: string, body: GrantModelSaveInput): Promise<GrantJsonResponse<T>>;
  portfolioSeed<T = GrantObject>(caseId: string, expectedVersion: number, forecastId: string): Promise<GrantJsonResponse<T>>;
  portfolioPreview<T = GrantObject>(caseId: string, expectedVersion: number, inputs: GrantObject): Promise<GrantJsonResponse<T>>;
  portfolioSave<T = GrantObject>(caseId: string, body: GrantModelSaveInput): Promise<GrantJsonResponse<T>>;
  portfolioSelection<T = GrantObject>(caseId: string, expectedVersion: number, portfolioId: string, alternativeId: string): Promise<GrantJsonResponse<T>>;
  installationSeed(caseId: string, expectedVersion: number): Promise<GrantJsonResponse<GrantInstallationSeed>>;
  installationWorkshares<T = GrantObject>(caseId: string, body: GrantWorkshareSourceSelection): Promise<GrantJsonResponse<T>>;
  installationWorkshareSeed(caseId: string, body: GrantWorkshareSourceSelection & GrantInstallationSelection & { workshareCaseId: string; document?: GrantInstallationDocument }): Promise<GrantJsonResponse<GrantInstallationSeed>>;
  installationWorkflows<T = GrantObject>(caseId: string, body: GrantWorkflowSourceSelection): Promise<GrantJsonResponse<T>>;
  installationWorkflowSeed(caseId: string, body: GrantWorkflowSourceSelection & GrantInstallationSelection & { cycleIds: string[]; document?: GrantInstallationDocument }): Promise<GrantJsonResponse<GrantInstallationSeed>>;
  installationPreview(caseId: string, body: GrantInstallationPreviewInput): Promise<GrantJsonResponse<GrantInstallationPreview>>;
  installationSave(caseId: string, body: GrantInstallationSaveInput): Promise<GrantJsonResponse<GrantInstallationSaveReceipt>>;
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
