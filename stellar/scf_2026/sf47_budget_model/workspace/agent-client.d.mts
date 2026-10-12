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
  read(view: 'forecast', selection: { caseId: string; forecastId: string }): Promise<GrantJsonResponse<GrantSavedForecast>>;
  read(view: 'portfolio', selection: { caseId: string; portfolioId: string }): Promise<GrantJsonResponse<GrantSavedPortfolio>>;
  read<T = GrantObject>(view: GrantOtherReadView, selection?: GrantReadSelection): Promise<GrantJsonResponse<T>>;
  plan<T = GrantObject>(action: 'estimate' | 'save' | 'restore' | 'clone', planId: string, body: GrantObject): Promise<GrantJsonResponse<T>>;
  createCase<T = GrantObject>(body: { planId: string; selectedRevision: number; expectedContentSha256: string; name: string; mode: 'OPERATIONS' | 'WALKTHROUGH'; calendarStart?: GrantCivilDate; actor: string; requestId: string }): Promise<GrantJsonResponse<T>>;
  command<T = GrantObject>(caseId: string, body: GrantOperationRequest & { action: GrantCaseAction; data: GrantObject }): Promise<GrantJsonResponse<T>>;
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
