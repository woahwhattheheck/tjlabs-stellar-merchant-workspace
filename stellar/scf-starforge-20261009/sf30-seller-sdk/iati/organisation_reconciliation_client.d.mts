/** MIT. Original decimal strings and pinned source/revision identities. */
import type { OrganisationBudgetRow, OrganisationSourceEntry } from './organisation_client.mjs';
export type Sha256 = string;
export type DecimalString = string;
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export interface RequestOptions { signal?: AbortSignal; headers?: Record<string, string>; }
export interface RequestBridgeOptions extends RequestOptions {
  body?: BodyInit | ReadableStream<Uint8Array>; raw?: boolean; maximum?: number;
}
export type ReconciliationRequest = (path: string, options?: RequestBridgeOptions) => Promise<any>;
export interface RevisionSelection { id: Sha256; revision: number; }
export interface OrganisationSelection extends RevisionSelection { organisationKey: Sha256; }
export interface ReconciliationSelector {
  organisation: OrganisationSelection;
  portfolios: RevisionSelection[];
}
export interface Period { start: string | null; end: string | null; }
export interface Eligibility {
  eligible: boolean; reasons?: string[]; [key: string]: unknown;
}
export interface FinancialRow {
  id: Sha256;
  collection: 'budgets' | 'transactions';
  activityId?: string | null;
  reportingOrgRef?: string | null;
  hierarchy?: string | null;
  currency?: string | null;
  valueDate?: string | null;
  amount: DecimalString | null;
  period?: Period | null;
  transactionDate?: string | null;
  budgetType?: string | null;
  budgetStatus?: string | null;
  transactionType?: string | null;
  eligibility?: Eligibility | boolean | string | null;
  recipients?: JsonValue;
  sourceId: Sha256;
  nativeRowId: Sha256;
  buildIds: Sha256[];
  portfolios: RevisionSelection[];
  dimensions: Record<string, unknown>;
  originalIssues: JsonValue;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}
/** Assessed native organisation rows retain their nested value/calculation shape. */
export interface OrganisationFinancialRow extends OrganisationBudgetRow {
  calculation: {
    eligible: boolean;
    amount: DecimalString | null;
    context: Record<string, unknown>;
  };
  [key: string]: unknown;
}
export interface SelectedOrganisation extends OrganisationSourceEntry {
  name: string;
  sourceId: Sha256;
  candidateSha256: Sha256;
  snapshotSha256: Sha256;
  plan: RevisionSelection;
}
export interface ComparisonDefinition {
  organisationRowId: Sha256;
  activityRowIds: Sha256[];
  coverage: 'selected' | 'complete';
  scopeStatement: string;
  /** 'separate' is the native default. Nominal comparison retains every value date. */
  valueDatePolicy?: 'separate' | 'nominal';
}
export interface IssueDecision {
  issueId: Sha256;
  decision: 'acknowledge' | 'follow-up';
  actor: string;
  note: string;
}
export interface ReconciliationDefinition extends ReconciliationSelector {
  name: string;
  notes: string;
  comparisons: ComparisonDefinition[];
  decisions: IssueDecision[];
}
export interface SaveReconciliation extends ReconciliationDefinition {
  requestId: string;
  id?: Sha256;
  expectedRevision?: number;
}
export interface ReconciliationIssue {
  id: Sha256;
  code: string;
  message: string;
  severity: string;
  comparisonId?: Sha256;
  rowIds: Sha256[];
  [key: string]: unknown;
}
export interface ExcludedRow { id: Sha256; reasons: string[]; [key: string]: unknown; }
export interface FinancialComparison {
  id: Sha256;
  organisationRowId: Sha256;
  basis: string;
  coverage: 'selected' | 'complete';
  scopeStatement: string;
  currency: string | null;
  organisationAmount: DecimalString | null;
  selectedAmount: DecimalString | null;
  difference: DecimalString | null;
  selectedCount: number;
  eligibleCount: number;
  excludedCount: number;
  issues: Sha256[];
  includedRowIds?: Sha256[];
  excludedRows?: ExcludedRow[];
  valueDates?: unknown;
  valueDatePolicy?: 'separate' | 'nominal';
  [key: string]: unknown;
}
export interface ReconciliationPreview {
  schema: string;
  selection: ReconciliationSelector;
  organisation: SelectedOrganisation;
  portfolios: Array<RevisionSelection & { name: string; definitionSha256: Sha256; selection: Record<string, unknown> }>;
  organisationRows: OrganisationFinancialRow[];
  activityRows: FinancialRow[];
  comparisons: FinancialComparison[];
  issues: ReconciliationIssue[];
  snapshotSha256: Sha256;
  summary: Record<string, unknown>;
  [key: string]: unknown;
}
export interface Review {
  decision: 'approve' | 'request_changes';
  actor: string;
  note: string;
  acknowledgedIssueIds: Sha256[];
  [key: string]: unknown;
}
export interface SavedReview extends Review {
  reportSha256: Sha256;
}
export interface ReviewReconciliation extends Review {
  requestId: string;
  id: Sha256;
  expectedRevision: number;
}
export interface ReconciliationCase {
  id: Sha256;
  schema: string;
  revision: number;
  name: string;
  definition: ReconciliationDefinition;
  report: ReconciliationPreview;
  review: SavedReview | null;
  previousRevision: number | null;
  /** Original Unix timestamps in seconds, including fractional seconds. */
  createdAt: number;
  updatedAt: number;
  summary: Record<string, unknown>;
  [key: string]: unknown;
}
export interface Status {
  schema: string;
  workspaceSha256?: Sha256;
  cases: Array<Pick<ReconciliationCase, 'id' | 'revision' | 'name' | 'review'> & Record<string, unknown>>;
  organisationPlans: Array<RevisionSelection & {
    name: string; sourceId?: Sha256; organisationKeys?: Sha256[]; [key: string]: unknown;
  }>;
  activityPortfolios: Array<RevisionSelection & { name: string; [key: string]: unknown }>;
  [key: string]: unknown;
}
export interface PageOptions {
  offset?: number; limit?: number;
  /** Used as a client consistency check for catalog; passed to the native rows route. */
  expectedSnapshot?: Sha256;
}
export interface RegisterPage<Row> {
  rows: Row[];
  total: number;
  offset: number;
  limit: number;
  snapshotSha256: Sha256;
  organisation?: SelectedOrganisation;
  portfolios?: unknown[];
  [key: string]: unknown;
}
export interface CatalogInput extends ReconciliationSelector, PageOptions {
  section: 'organisation' | 'activity';
}
export type RowSection = 'comparisons' | 'activity' | 'issues' | 'decisions';
export interface RowsInput extends PageOptions { revision: number; section: RowSection; }
export type RegisterRow = FinancialComparison | FinancialRow | ReconciliationIssue | IssueDecision;
export type RequestState =
  | { state: 'RECORDED'; case: ReconciliationCase; input?: unknown; [key: string]: unknown }
  | { state: 'NOT_RECORDED'; [key: string]: unknown };
export interface RevisionComparison {
  schema: string;
  before: RevisionSelection;
  after: RevisionSelection;
  sourceChanges: { before: ReconciliationSelector; after: ReconciliationSelector };
  added: FinancialComparison[];
  removed: FinancialComparison[];
  changed: Array<{
    context: Record<string, unknown>;
    before: Sha256;
    after: Sha256;
    fields: Record<string, { before: unknown; after: unknown }>;
  }>;
  ambiguous: Array<{
    context: Record<string, unknown>;
    before: FinancialComparison[];
    after: FinancialComparison[];
  }>;
  unchanged: Sha256[];
  summary: Record<'added' | 'removed' | 'changed' | 'ambiguous' | 'unchanged', number>;
}
export interface ReceiveResult {
  state: 'COMPLETE';
  case: ReconciliationCase;
  currentCase: ReconciliationCase;
  reused: boolean;
  revisions: number;
  organisationEditions: number;
  activityEditions: number;
  packet: { bytes: number; sha256: Sha256 };
  [key: string]: unknown;
}
export interface OrganisationReconciliationClient {
  status(options?: RequestOptions): Promise<Status>;
  plan(id: Sha256, options?: RequestOptions & { revision?: number }): Promise<ReconciliationCase>;
  history(id: Sha256, options?: RequestOptions): Promise<{ history: ReconciliationCase[] }>;
  request(requestId: string, options?: RequestOptions): Promise<RequestState>;
  catalog(input: CatalogInput & { section: 'organisation' }, options?: RequestOptions): Promise<RegisterPage<OrganisationFinancialRow>>;
  catalog(input: CatalogInput & { section: 'activity' }, options?: RequestOptions): Promise<RegisterPage<FinancialRow>>;
  catalog(input: CatalogInput, options?: RequestOptions): Promise<RegisterPage<FinancialRow | OrganisationFinancialRow>>;
  catalogPages(input: ReconciliationSelector & { section: 'organisation' | 'activity' },
    options?: RequestOptions & { limit?: number }): AsyncGenerator<RegisterPage<FinancialRow | OrganisationFinancialRow>, void, unknown>;
  rows(id: Sha256, input: RowsInput, options?: RequestOptions): Promise<RegisterPage<RegisterRow>>;
  rowPages(id: Sha256, input: Pick<RowsInput, 'revision' | 'section'>,
    options?: RequestOptions & { limit?: number }): AsyncGenerator<RegisterPage<RegisterRow>, void, unknown>;
  preview(input: ReconciliationDefinition, options?: RequestOptions): Promise<ReconciliationPreview>;
  save(input: SaveReconciliation, options?: RequestOptions): Promise<ReconciliationCase>;
  review(input: ReviewReconciliation, options?: RequestOptions): Promise<ReconciliationCase>;
  compare(input: { before: RevisionSelection; after: RevisionSelection }, options?: RequestOptions): Promise<RevisionComparison>;
  file(id: Sha256, kind: 'report' | 'csv' | 'json',
    options: RequestOptions & { revision: number }): Promise<Response>;
  export(id: Sha256, options: RequestOptions & { revision: number }): Promise<Response>;
  receive(input: { body: BodyInit | ReadableStream<Uint8Array>; bytes: number },
    options?: RequestOptions): Promise<ReceiveResult>;
}
export declare function createOrganisationReconciliationClient(request: ReconciliationRequest): OrganisationReconciliationClient;
export declare const ORGANISATION_RECONCILIATION_PREFIX: '/api/iati/reconciliation/';
