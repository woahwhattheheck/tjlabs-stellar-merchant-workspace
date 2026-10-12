/** MIT. Typed access to the original IATI console. Financial and identifier values remain strings. */
export type Sha256 = string;
export type ExactDecimalString = string;
export type CalendarDate = string;
export type Collection = 'activities' | 'transactions' | 'budgets';
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export interface RequestOptions { signal?: AbortSignal }
export interface RevisionOptions extends RequestOptions { revision?: number }
export interface Selection {
  activityIds?: string[];
  currencies?: string[];
  transactionTypes?: string[];
  budgetTypes?: string[];
  dateFrom?: CalendarDate;
  dateTo?: CalendarDate;
}
export interface Review {
  status: 'draft' | 'reviewed' | 'needs-correction';
  /** A named reviewer is required for reviewed or needs-correction. */
  reviewer: string;
  note: string;
}
export interface PortfolioDefinition {
  requestId: string;
  name: string;
  notes?: string;
  /** One to thirty-two distinct, complete retained publisher source IDs. */
  sources: Sha256[];
  selection?: Selection;
  review?: Review;
}
export type PortfolioSave = PortfolioDefinition &
  ({ id?: never; expectedRevision?: never } | { id: Sha256; expectedRevision: number });
export interface Column {
  name: string; type: 'string'; nullable: false;
}
export interface IatiPlan {
  schema?: 'stellar-forge.iati-mapping.v1';
  domainVersion?: 'iati-2.03-associations-2';
  collection: Collection;
  name?: string;
  language?: string;
  fields?: string[];
  selection?: Selection;
  /** These capabilities are derived from the chosen known fields by the native mapper. */
  columns?: Column[];
  keys?: ['row_id'];
  filters?: string[];
  ranges?: string[];
  sorts?: string[];
  allowEmpty?: boolean;
  defaultLimit?: number;
  maxLimit?: number;
  maxBytes?: number;
  maxRows?: number;
  maxCellChars?: number;
}
export interface SavedPlan { id: Sha256; plan: IatiPlan }
export interface FileIdentity { bytes: number; sha256: Sha256 }
export interface SourceSummary {
  id: Sha256; label: string; name: string; bytes: number; created: number;
}
export interface Source extends SourceSummary { inventory: Record<string, unknown> }
export interface Profile {
  schema: 'stellar-forge.iati-profile.v1';
  source: Pick<SourceSummary, 'id' | 'label' | 'name' | 'bytes'>;
  inventory: Record<string, unknown>;
}
export interface NativeDescription {
  name: string;
  rowCount: number;
  snapshot: Sha256;
  maxLimit: number;
  columns: Array<Column & { filterable: boolean; rangeFilterable: boolean; sortable: boolean }>;
  [key: string]: unknown;
}
export interface NativeBuild {
  schema: string; id: Sha256; source: Sha256; plan: Sha256;
  rowCount: number; keys: string[];
  columns: Array<{ column: string; emptyCells: number; nullValues: number }>;
  native: NativeDescription;
  engineBlob: string;
  files: Record<'data.csv' | 'dataset.json' | 'rows.sqlite', FileIdentity>;
}
export interface QueryPage {
  schema: 'stellar-forge.dataset-page.v1';
  dataset: NativeDescription;
  fields: string[];
  rows: Array<Record<string, string>>;
  page: { limit: number; total: number; returned: number; nextCursor: string | null };
  filters: Record<string, string>;
  ranges?: Array<{ column: string; operator: string; value: string }>;
  order?: unknown;
}
export interface NativeQuery {
  id: number; ok: true; engineBlob: string; dataset: NativeDescription;
  response:
    | { status: 200; headers: Record<string, string>; body: QueryPage }
    | { status: 400 | 409 | 413; body: { error: string; message: string } };
}
export interface NativeComparison {
  schema: string; id: Sha256; before: Sha256; after: Sha256;
  counts: Record<string, number>; changesSha256: Sha256;
  [key: string]: unknown;
}
export interface ChangePage {
  rows: Array<{ kind: string; key: string[]; fields?: string[]; before?: unknown; after?: unknown }>;
  offset: number; nextOffset: number | null;
}
export interface BaseFinancialGroup {
  collection: 'transactions' | 'budgets';
  reportingOrgRef: string;
  hierarchy: string;
  currency: string;
  valueDate: string;
  count: number;
  amount: ExactDecimalString;
}
export interface TransactionGroup extends BaseFinancialGroup {
  collection: 'transactions';
  transactionType: string;
  transactionTypeLabel: string;
}
export interface BudgetGroup extends BaseFinancialGroup {
  collection: 'budgets';
  budgetType: string; budgetTypeLabel: string;
  budgetStatus: string; budgetStatusLabel: string;
  periodStart: string; periodEnd: string;
}
export interface PortfolioCounts {
  sources: number; activities: number; transactions: number; budgets: number;
  plannedDisbursementsRetained: number;
  reviewRecords: number; excludedFinancialRecords: number;
}
export interface Coverage {
  bySource: Array<{ source: Sha256; activities: number; transactions: number; budgets: number; reportingOrgRefs: string[] }>;
  activityCount: number; activityIdsSha256: Sha256;
}
export interface ReportSummary {
  counts: PortfolioCounts;
  financialGroups: Array<TransactionGroup | BudgetGroup>;
  reviewCount: number;
  coverage: Coverage;
  semantics: Record<string, string>;
  [key: string]: unknown;
}
export interface Portfolio {
  schema: 'stellar-forge.iati-portfolio.v1';
  id: Sha256; revision: number; name: string; notes: string;
  sources: Sha256[]; selection: Selection; review: Review;
  editions: Array<{
    source: Sha256;
    activities: NativeBuild; transactions: NativeBuild; budgets: NativeBuild;
  }>;
  created: number; updated: number; previousRevision: number | null;
  report: ReportSummary; definitionSha256: Sha256;
}
export interface Report extends ReportSummary {
  portfolio: Sha256; revision: number; name: string; notes: string;
  review: Review; definitionSha256: Sha256;
}
export interface PortfolioCompare {
  id: Sha256; beforeRevision: number; afterRevision: number;
  /** Explicit original publisher edition pairs when automatic pairing is ambiguous. */
  pairs?: Array<{ before: Sha256; after: Sha256 }>;
}
export interface PortfolioComparison {
  schema: 'stellar-forge.iati-portfolio-comparison.v1';
  id: Sha256; portfolio: Sha256; beforeRevision: number; afterRevision: number;
  selectionChanged: boolean;
  pairs: Array<{ before: Sha256; after: Sha256 }>;
  addedSources: Sha256[]; removedSources: Sha256[];
  comparisons: Array<{ collection: Collection; before: Sha256; after: Sha256; comparison: NativeComparison }>;
  beforeCounts: PortfolioCounts; afterCounts: PortfolioCounts;
  semantics: unknown;
}
export interface WorkspaceState {
  schema: 'stellar-forge.iati-workspace.v1';
  sources: SourceSummary[];
  plans: Array<{ id: Sha256; name: string; created: number }>;
  builds: NativeBuild[]; comparisons: NativeComparison[];
  portfolios: Portfolio[];
}
export interface Presets {
  schema: 'stellar-forge.iati-presets.v1';
  standard: '2.03';
  collections: Array<{ collection: Collection; label: string; fields: string[]; plan: IatiPlan }>;
  transactionTypes: Record<string, string>;
  budgetTypes: Record<string, string>;
  budgetStatuses: Record<string, string>;
  currencyCatalog: { asOf: CalendarDate; codes: string[]; withdrawn: string[]; source: string };
}
export interface PythonIdentity {
  executable: string; prefix: string; basePrefix: string;
  implementation: string; version: [number, number, number];
}
export interface ManagedLaunch {
  schema: 'stellar-forge.iati-workspace-launch.v1';
  status: 'IATI_WORKSPACE_READY';
  workspace: string; bindingSha256: Sha256; sourceRoot: string;
  python: PythonIdentity; pid: number;
  /** Private capability URL. Never publish it with report or source exports. */
  console: string;
  connectionFile?: string;
}
export interface ReceivedPortfolio {
  portfolio: Portfolio; reconstructed: true;
  historyCount: number; datasetCount: number; reportFiles: string[];
  /** Actual receiving engine and SQLite index identities; original portfolio history remains unchanged. */
  receivingBuilds: Array<{ id: Sha256; engineBlob: string; indexSha256: Sha256 }>;
}
export interface ReceivedProject { source: Sha256; plan: Sha256; build: NativeBuild; [key: string]: unknown }
export interface SourceInput {
  body: BodyInit | AsyncIterable<Uint8Array>;
  /** Actual observed byte count of the complete original input, up to 256 MiB. */
  bytes: number;
  name?: string; label?: string;
}
export interface PacketInput {
  body: BodyInit | AsyncIterable<Uint8Array>;
  /** Actual complete archive length, within the native 4 GiB packet limit. */
  bytes: number;
  kind?: 'portfolio' | 'project';
}

/** Native Zimmerman DQA service request; scalar choices are preserved exactly. */
export interface DqaParameters {
  organisation: string | string[];
  segmentation?: { countries?: string[] | null; regions?: string[] | null; sectors?: string[] | null } | null;
  require_funding_and_accountable?: boolean; include_exemptions?: boolean;
  optional_rules?: { check_acronyms?: boolean } | null;
  skip_cache?: boolean | null; failed_activities?: boolean; use_budget_date_filter?: boolean;
}
export interface DqaProviderSave {
  requestId: string; name: string; endpoint: string;
  /** Existing host environment variable containing the native raw Authorization value. */
  authorizationEnv: string; timeoutSeconds?: number; notes?: string; previous?: Sha256;
}
export interface DqaProvider extends Omit<DqaProviderSave, 'requestId'> {
  schema: 'stellar-forge.iati-dqa-provider.v1'; id: Sha256; timeoutSeconds: number; notes: string;
  createdAt: string; protocol: { repository: string; commit: string; license: 'MIT' };
}
export interface DqaCapture {
  requestId: string; provider: Sha256; parameters: DqaParameters;
  label: string; operator: string; notes?: string;
}
export interface DqaNativeFile extends FileIdentity { contentType: string }
export interface DqaExchange {
  method: 'GET' | 'POST'; url: string; startedAt: string; receivedAt: string; status: number;
  headers: Record<string, string[]>; body: DqaNativeFile;
}
export interface DqaConfiguration {
  file: DqaNativeFile; state: 'COMPLETE' | 'UNAVAILABLE'; calls: DqaExchange[];
  configurations: Record<string, JsonValue[]>; error?: string; observedAt?: string;
}
export interface DqaCounts { pass_count: number; fail_count: number; not_applicable_count: number }
export interface DqaSummary {
  organisation: string; total_programmes: number; total_projects: number;
  /** Exact literal retained from the native DQA response, in its provider-defined unit. */
  total_budget: string; financial_year: string;
}
export interface DqaAssessment extends DqaCapture {
  schema: 'stellar-forge.iati-dqa-assessment.v1'; id: Sha256; notes: string;
  request: DqaNativeFile; response: DqaExchange; configurationBefore: DqaConfiguration;
  configurationAfter: DqaConfiguration; configurationStable: boolean; attempt: number;
  generatedAt: string; receivedAt: string; summary: DqaSummary; counts: DqaCounts;
  listedActivities: number; listedRuleResults: number; detailsSelected: boolean;
  percentages: Record<'total_percentages' | 'h1_percentages' | 'h2_percentages' | 'percentages', JsonValue | undefined>;
  availableSegmentations: { countries: string[]; regions: string[]; sectors: string[] };
  reviewFindings: string[];
}
export type DqaAssessmentSummary = Pick<DqaAssessment, 'id' | 'provider' | 'label' | 'operator' | 'generatedAt' |
  'receivedAt' | 'summary' | 'counts' | 'listedActivities' | 'listedRuleResults' | 'configurationStable'>;
export type DqaNativeStatus = 'pass' | 'fail' | 'not_applicable';
export interface DqaFinding {
  key: Sha256; activityKey: Sha256; activityPosition: number; activityOccurrence: number; rulePosition: number;
  iatiIdentifier: string; hierarchy: number; title: string | null; activityStatus: string | null;
  kind: 'attribute' | 'document'; rule: string; status: DqaNativeStatus; native: Record<string, JsonValue>;
}
export interface DqaPage<T> { total: number; offset: number; limit: number; items: T[]; nextOffset: number | null }
export type DqaActionStatus = 'open' | 'investigate' | 'addressed' | 'accepted';
export interface DqaAction {
  assessment: Sha256; finding: Sha256; status: DqaActionStatus; owner: string; note: string; dueDate: CalendarDate | '';
}
export type DqaActionEdit =
  (Pick<DqaAction, 'assessment' | 'finding' | 'status'> & Partial<Pick<DqaAction, 'owner' | 'note' | 'dueDate'>>) |
  { assessment: Sha256; finding: Sha256; remove: true };
export interface DqaCaseDefinition {
  requestId: string; name: string; client: string; notes?: string; assessmentIds: Sha256[];
  portfolios?: Array<{ id: Sha256; revision: number }>; review: Review; reviewEdits?: DqaActionEdit[];
}
export type DqaCaseSave = DqaCaseDefinition &
  ({ id?: never; expectedRevision?: never } | { id: Sha256; expectedRevision: number });
export interface DqaCase extends Omit<DqaCaseDefinition, 'requestId' | 'reviewEdits'> {
  schema: 'stellar-forge.iati-dqa-case.v1'; id: Sha256; revision: number; notes: string;
  portfolios: Array<{ id: Sha256; revision: number }>; actions: DqaAction[];
  previousRevision: number | null; createdAt: string; updatedAt: string; definitionSha256: Sha256;
}
export interface DqaNativeActivity {
  iati_identifier: string; hierarchy: number; title: string | null; activity_status: string | null;
  attributes: Record<string, JsonValue>[]; documents: Record<string, JsonValue>[];
  overall_status: DqaNativeStatus; failure_count: number; [key: string]: JsonValue;
}
export interface DqaActivityChange {
  activityKey: Sha256; kind: 'newly-listed' | 'no-longer-listed' | 'changed';
  before: DqaNativeActivity | null; after: DqaNativeActivity | null;
}
export interface DqaComparison {
  schema: 'stellar-forge.iati-dqa-comparison.v1'; id: Sha256; before: Sha256; after: Sha256;
  scopeChanges: Record<string, { before: JsonValue; after: JsonValue }>;
  providerChanged: boolean; configurationChanged: boolean; beforeGeneratedAt: string; afterGeneratedAt: string;
  beforeSummary: DqaSummary; afterSummary: DqaSummary; beforeCounts: DqaCounts; afterCounts: DqaCounts;
  counts: Record<'newly-listed' | 'no-longer-listed' | 'changed' | 'unchanged', number>;
  changes: DqaNativeFile; meaning: string;
}
export interface DqaOperation {
  requestId: string; kind: 'provider' | 'assessment' | 'case'; input: Record<string, JsonValue>;
  inputSha256: Sha256; state: string; createdAt: string; attempts: Record<string, JsonValue>[];
  result?: Sha256 | { id: Sha256; revision: number };
}
export interface ReceivedDqaCase {
  case: DqaCase; receiving: { schema: 'stellar-forge.iati-dqa-receiving.v1'; packetSha256: Sha256;
    case: Sha256; revision: number; assessments: number; historyRevisions: number; providers: number;
    files: number; reports: string[]; portfolioPackets: number };
}

/** Borrows an existing authenticated loopback console. It creates no source store or process. */

export type ParticipantAction = 'create' | 'feedback' | 'evidence' | 'triage' | 'correct' | 'candidate' | 'finance' | 'review' | 'release';
export interface ParticipantRequest { requestId: string; actor: string; id?: Sha256; expectedRevision?: number; [field: string]: unknown }
export interface ParticipantFinding {
 id: string; activityId: string; indicatorId: string; finding: string; priority: 'normal' | 'blocking';
 owner: string; dueDate: string; status: 'open' | 'planned' | 'resolved' | 'deferred'; note: string;
 evidenceIds: Sha256[]; sourceAsset: Sha256; sourceRow: number; original: Record<string,string>;
}
export interface ParticipantSchemaResult {
 schema: 'stellar-forge.iati-schema-validation.v1'; state: 'VALID' | 'INVALID' | 'UNAVAILABLE';
 sourceSha256: Sha256; sourceBytes: number; stage: string; schemaManifestSha256?: Sha256;
 errors: Array<{line: number; column: number; message: string; [field: string]: unknown}>;
 [field: string]: unknown;
}
export interface ParticipantProject {
 schema: 'stellar-forge.iati-participant-project.v1'; id: Sha256; revision: number; name: string;
 publisherRef: string; cutoff: string; notes: string; activityIds: string[];
 baselineSource: Sha256; candidateSource: Sha256;
 state: 'DRAFT' | 'NEEDS_CORRECTION' | 'REVIEWED' | 'RELEASED';
 feedback: ParticipantFinding[]; feedbackAssets: Array<Record<string,unknown>>; evidence: Array<Record<string,unknown>>;
 corrections: Array<Record<string,unknown>>; baselineValidation: ParticipantSchemaResult;
 candidateValidation: ParticipantSchemaResult; methodology: Record<string,unknown>; lastEditor: string;
 finance: null | {portfolioId: Sha256; beforeRevision: number; candidateRevision: number; comparisonId: Sha256; baselineSource: Sha256; candidateSource: Sha256; comparedBy: string; comparedAt: number};
 review: null | {decision: 'accepted' | 'needs-correction'; reviewer: string; note: string; sourceId: Sha256; definitionSha256: Sha256; [field:string]:unknown};
 release: null | {id:Sha256;label:string;note:string;sourceId:Sha256;publicationState:'READY_FOR_PUBLISHER';[field:string]:unknown};
 created: number; updated: number; previousRevision: number | null; lastAction: Record<string,unknown>;
}
export interface ParticipantField {
 field: 'title' | 'description' | 'participating-org' | 'document-link'; index: number; sha256: Sha256;
 attributes: Record<string,string>; narratives: Array<{index:number;sha256:Sha256;language:string;text:string}>;
 categories: string[];
}
export interface ParticipantPreview {
 project:Sha256;revision:number;sourceId:Sha256;candidateId:Sha256;previewSha256:Sha256;
 audit:Record<string,unknown>;validation:ParticipantSchemaResult;
}
export interface ParticipantReceiving {
 schema:'stellar-forge.iati-participant-receiving.v1';state:'COMPLETE';project:ParticipantProject;
 revisions:number;sources:number;evidenceFiles:number;packet:{bytes:number;sha256:Sha256};
}

export declare class IatiWorkspaceClient {
  constructor(consoleUrl: string, options?: { timeoutMs?: number });
  readonly origin: string;
  state(options?: RequestOptions): Promise<WorkspaceState>;
  launch(options?: RequestOptions): Promise<ManagedLaunch>;
  source(id: Sha256, options?: RequestOptions): Promise<Source>;
  plan(id: Sha256, options?: RequestOptions): Promise<SavedPlan>;
  savePlan(plan: IatiPlan, options?: RequestOptions): Promise<SavedPlan>;
  build(source: Sha256, plan: Sha256, options?: RequestOptions): Promise<NativeBuild>;
  query(build: Sha256, params?: Record<string, string>, options?: RequestOptions): Promise<NativeQuery>;
  compare(before: Sha256, after: Sha256, options?: RequestOptions): Promise<NativeComparison>;
  changes(id: Sha256, options?: RequestOptions & { offset?: number; limit?: number }): Promise<ChangePage>;
  presets(options?: RequestOptions): Promise<Presets>;
  profile(source: Sha256, options?: RequestOptions): Promise<Profile>;
  portfolios(options?: RequestOptions): Promise<{ portfolios: Portfolio[] }>;
  portfolio(id: Sha256, options?: RevisionOptions): Promise<Portfolio>;
  history(id: Sha256, options?: RequestOptions): Promise<{ history: Portfolio[] }>;
  savePortfolio(input: PortfolioSave, options?: RequestOptions): Promise<Portfolio>;
  report(id: Sha256, options?: RevisionOptions): Promise<Report>;
  comparePortfolio(input: PortfolioCompare, options?: RequestOptions): Promise<PortfolioComparison>;
  /** Consume or cancel the returned full native stream; this is never a reconstructed file. */
  export(kind: 'project' | 'dataset' | 'changes' | 'portfolio' | 'report', id: Sha256, options?: RevisionOptions): Promise<Response>;
  ingest(input: SourceInput, options?: RequestOptions): Promise<Source>;
  receive(input: PacketInput, options?: RequestOptions): Promise<ReceivedPortfolio | ReceivedProject>;
  dqaProviders(options?: RequestOptions): Promise<{ providers: DqaProvider[] }>;
  dqaSaveProvider(input: DqaProviderSave, options?: RequestOptions): Promise<DqaProvider>;
  dqaCapture(input: DqaCapture, options?: RequestOptions): Promise<DqaAssessment>;
  dqaAssessments(options?: RequestOptions): Promise<{ assessments: DqaAssessmentSummary[] }>;
  dqaAssessment(id: Sha256, options?: RequestOptions): Promise<DqaAssessment>;
  dqaFindings(id: Sha256, options?: RequestOptions & { offset?: number; limit?: number; status?: DqaNativeStatus | ''; search?: string }): Promise<DqaPage<DqaFinding> & { assessment: Sha256 }>;
  dqaCases(options?: RequestOptions): Promise<{ cases: Array<Pick<DqaCase, 'id' | 'revision' | 'name' | 'client' | 'review' | 'updatedAt' | 'assessmentIds'>> }>;
  dqaCase(id: Sha256, options?: RevisionOptions): Promise<DqaCase>;
  dqaHistory(id: Sha256, options?: RequestOptions): Promise<{ history: DqaCase[] }>;
  dqaSaveCase(input: DqaCaseSave, options?: RequestOptions): Promise<DqaCase>;
  dqaCompare(before: Sha256, after: Sha256, options?: RequestOptions): Promise<DqaComparison>;
  dqaComparison(id: Sha256, options?: RequestOptions & { offset?: number; limit?: number }): Promise<DqaComparison & { page: DqaPage<DqaActivityChange> }>;
  dqaOperations(options?: RequestOptions & { offset?: number; limit?: number }): Promise<DqaPage<DqaOperation>>;
  dqaExport(id: Sha256, options?: RevisionOptions): Promise<Response>;
  dqaFile(id: Sha256, kind: 'response' | 'request' | 'configuration-before' | 'configuration-after', options?: RequestOptions): Promise<Response>;
  dqaReceive(input: Pick<PacketInput, 'body' | 'bytes'>, options?: RequestOptions): Promise<ReceivedDqaCase>;

  publishingContext(options?: RequestOptions): Promise<{schema:'stellar-forge.iati-participant-context.v1';workspaceSha256:Sha256}>;
  publishingMethodology(options?: RequestOptions): Promise<{id:Sha256;body:Record<string,unknown>;bytes:number;sha256:Sha256}>;
  publishingProjects(options?: RequestOptions): Promise<{projects:ParticipantProject[]}>;
  publishingProject(id:Sha256,options?:RevisionOptions): Promise<ParticipantProject>;
  publishingHistory(id:Sha256,options?:RequestOptions): Promise<{history:ParticipantProject[]}>;
  publishingRequest(requestId:string,options?:RequestOptions): Promise<{requestId:string;state:'RECORDED'|'NOT_RECORDED';input?:ParticipantRequest;project?:ParticipantProject}>;
  publishingActivities(id:Sha256,options?:RevisionOptions & {offset?:number;limit?:number}): Promise<{project:Sha256;revision:number;sourceId:Sha256;rows:Array<Record<string,unknown>>;total:number;offset:number;limit:number}>;
  publishingFields(id:Sha256,activity:string,options?:RevisionOptions): Promise<{project:Sha256;revision:number;sourceId:Sha256;activityId:string;activitySha256:Sha256;attributes:Record<string,string>;fields:ParticipantField[]}>;
  publishingPreview(input:{id:Sha256;expectedRevision:number;patches:Array<Record<string,unknown>>},options?:RequestOptions): Promise<ParticipantPreview>;
  publishingSave(action:ParticipantAction,input:ParticipantRequest,options?:RequestOptions): Promise<ParticipantProject>;
  publishingExport(id:Sha256,options?:RevisionOptions): Promise<Response>;
  publishingSource(id:Sha256,options?:RevisionOptions & {edition?:'baseline'|'candidate'}): Promise<Response>;
  publishingReceive(input:Pick<PacketInput,'body'|'bytes'>,options?:RequestOptions): Promise<ParticipantReceiving>;

  /** Aborts and drains this client's requests only. Applications owns the original console. */
  dispose(): Promise<void>;
}
/** The connection file is read from its exact private, single-linked regular file with a bounded FileHandle. */
export declare function connectIatiWorkspace(options:
  ({ consoleUrl: string; consoleUrlFile?: never } | { consoleUrl?: never; consoleUrlFile: string }) &
  { timeoutMs?: number }): Promise<IatiWorkspaceClient>;
