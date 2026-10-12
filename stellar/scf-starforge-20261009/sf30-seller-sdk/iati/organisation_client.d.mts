/** MIT. Exact organisation-planning contracts in the retained IATI workspace. */
import type { CalendarDate, ExactDecimalString, FileIdentity, JsonValue, RequestOptions, RevisionOptions, Sha256, SourceSummary } from './client.mjs';

export type OrganisationMethodology = 'iati203' | 'fcdo2023' | 'pwyf2026';
export type OrganisationBudgetFamily = 'total-budget' | 'recipient-org-budget' | 'recipient-country-budget' | 'recipient-region-budget' | 'total-expenditure';
export type OrganisationFileKind = 'source' | 'candidate' | 'report' | 'budgets' | 'documents';
export interface OrganisationAcquisition {
 sourceUrl?: string; retrievedAt?: string; licenceUrl?: string; licence?: string; notes?: string;
}
export interface OrganisationAssessment {
 asOf: CalendarDate; fiscalYearStart: CalendarDate; forwardYears: number; methodology: OrganisationMethodology;
 /** The complete reviewed prior-year operating-country denominator, when supplied. */
 operatingCountries?: string[];
}
export interface OrganisationNarrative {
 text: string; language: string | null; languageRaw?: string | null; languageSource?: string;
 attributes?: Record<string,string>;
}
export interface OrganisationAmount {
 text: ExactDecimalString | null; currency: string | null; currencyRaw: string | null; currencySource: string;
 valueDate: CalendarDate | null; count: number; attributes: Record<string,string>;
}
export interface OrganisationRecipient {
 kind: string; ref: string | null; code: string | null; vocabulary: string | null;
 vocabularyRaw: string | null; vocabularyUri: string | null;
 narratives: OrganisationNarrative[]; attributes: Record<string,string>; count: number;
}
export interface OrganisationBudgetLine {
 id: Sha256; kind: 'budget-line' | 'expense-line'; ordinal: number; ref: string | null; nodeSha256: Sha256;
 value: OrganisationAmount; narratives: OrganisationNarrative[]; calculation?: Record<string,unknown>;
}
export interface OrganisationIssue {
 id: Sha256; code: string; message: string; severity?: string;
 organisationKey?: Sha256; rowId?: Sha256; path?: string; [field: string]: unknown;
}
export interface OrganisationRowBase {
 id: Sha256; organisationKey: Sha256; ordinal: number; path: string; nodeSha256: Sha256;
 attributes: Record<string,string>; issues: OrganisationIssue[];
}
export interface OrganisationBudgetRow extends OrganisationRowBase {
 family: OrganisationBudgetFamily;
 status: { raw: string | null; effective: string | null; source: string };
 period: { start: CalendarDate | null; end: CalendarDate | null; startCount: number; endCount: number };
 value: OrganisationAmount; recipient: OrganisationRecipient | null; lines: OrganisationBudgetLine[];
 calculation?: { eligible: boolean; amount: ExactDecimalString | null; context?: Record<string,unknown> };
 lineSummary?: Record<string,unknown>;
}
export interface OrganisationDocumentRow extends OrganisationRowBase {
 url: string | null; format: string | null;
 titles: OrganisationNarrative[]; descriptions: OrganisationNarrative[];
 categories: Array<string | null>; languages: Array<string | null>;
 documentDate: CalendarDate | null; recipientCountries: Array<{ code: string | null; narratives: OrganisationNarrative[] }>;
 accessState: 'NOT_CHECKED'; baseUri: string | null;
}
export interface OrganisationSourceEntry extends OrganisationRowBase {
 key: Sha256; identifier: string | null;
 reportingOrg: { ref: string | null; type: string | null; secondaryReporter: string | null; narratives: OrganisationNarrative[]; attributes: Record<string,string> };
 names: OrganisationNarrative[]; defaultCurrency: string | null; defaultLanguage: string | null;
 budgetCount: number; documentCount: number;
}
export interface OrganisationProfile {
 schema: string; source: SourceSummary; root: Record<string, unknown>; organisations: OrganisationSourceEntry[];
 budgetCount: number; documentCount: number; issues: OrganisationIssue[];
}
export type OrganisationSnapshot = (
 { sourceId: Sha256; id?: never; revision?: never; view?: 'source' } |
 { sourceId?: never; id: Sha256; revision: number; view?: 'source' | 'candidate' }
) & { expectedSnapshot?: Sha256; organisationKey?: Sha256 };
export interface OrganisationSections {
 budgets: OrganisationBudgetRow; documents: OrganisationDocumentRow; issues: OrganisationIssue;
}
export type OrganisationRowsInput<S extends keyof OrganisationSections = keyof OrganisationSections> =
 OrganisationSnapshot & { section: S; offset?: number; limit?: number };
export interface OrganisationPage<T> {
 rows: T[]; total: number; offset: number; limit: number; snapshotSha256: Sha256;
}
export interface OrganisationEditTarget {
 id: Sha256; kind: 'text' | 'attribute' | 'element'; label: string; path: string;
 beforeSha256: Sha256; nodeSha256: Sha256; value?: string | null; attribute?: string; present?: boolean;
 allowedOperations: Array<'text' | 'attribute' | 'replace' | 'remove' | 'append'>;
}
export interface OrganisationDetail {
 row: OrganisationBudgetRow | OrganisationDocumentRow | OrganisationSourceEntry;
 xml: string; targets: OrganisationEditTarget[]; snapshotSha256: Sha256;
 /** Exact bytes of one requested target's owning element. */
 selectedTarget?: OrganisationEditTarget & { xml: string };
}
export type OrganisationEdit = { targetId: Sha256; beforeSha256: Sha256 } & (
 { operation: 'text'; value: string } |
 { operation: 'attribute'; attribute: string; value: string | null } |
 { operation: 'replace' | 'append'; xml: string } |
 { operation: 'remove' }
);
export interface OrganisationSaveDefinition {
 requestId: string; actor?: string; name: string; sourceId: Sha256; organisationKeys: Sha256[];
 assessment: OrganisationAssessment; acquisition?: OrganisationAcquisition;
 /** Complete sequential correction history applied to the retained original source. */
 edits: OrganisationEdit[]; notes?: string;
}
export type OrganisationSave = OrganisationSaveDefinition &
 ({ id?: never; expectedRevision?: never } | { id: Sha256; expectedRevision: number });
export interface OrganisationValidation {
 schema: string; state: 'VALID' | 'INVALID' | 'UNAVAILABLE'; sourceSha256: Sha256; sourceBytes: number;
 errors: Array<{ line?: number; column?: number; message: string; [field: string]: unknown }>;
 [field: string]: unknown;
}
export interface OrganisationReview {
 id: Sha256; decision: 'approve' | 'request_changes'; actor: string; note: string;
 acknowledgedIssueIds: Sha256[]; [field: string]: unknown;
}
export interface OrganisationRelease {
 id: Sha256; candidateSha256: Sha256; reviewId: Sha256;
 definitionSha256: Sha256; releasedAt: string; releasedBy: string; validation: OrganisationValidation;
 publicationState: 'READY_FOR_PUBLISHER'; published: false; [field: string]: unknown;
}
export interface OrganisationFileDescriptor extends FileIdentity {
 path: string; name: string; media: string;
}
export interface OrganisationReleaseResult {
 plan: OrganisationPlan; release: OrganisationRelease;
 files: Record<OrganisationFileKind, OrganisationFileDescriptor>;
}
export interface OrganisationPlan {
 id: Sha256; schema: string; revision: number; name: string; sourceId: Sha256; organisationKeys: Sha256[];
 assessment: OrganisationAssessment; acquisition: OrganisationAcquisition; edits: OrganisationEdit[]; notes: string;
 candidateSha256: Sha256; summary: Record<string, unknown>; validation?: OrganisationValidation;
 review: OrganisationReview | null; release: OrganisationRelease | null; createdAt: string; updatedAt: string;
 [field: string]: unknown;
}
export interface OrganisationStatus {
 workspaceSha256: Sha256; sources: Array<SourceSummary & { inventory: Record<string,unknown> }>;
 plans: OrganisationPlan[];
}
export interface OrganisationReviewInput {
 requestId: string; id: Sha256; expectedRevision: number; decision: 'approve' | 'request_changes';
 actor: string; note: string; acknowledgedIssueIds: Sha256[];
}
export interface OrganisationReleaseInput {
 requestId: string; id: Sha256; expectedRevision: number; reviewId: Sha256; actor?: string;
}
export interface OrganisationRevision { id: Sha256; revision: number }
export interface OrganisationCompare {
 requestId: string; before: OrganisationRevision; after: OrganisationRevision;
 rowPairs?: Array<{ beforeRowId: Sha256; afterRowId: Sha256 }>; actor?: string; notes?: string;
}
export interface OrganisationComparison {
 id: Sha256; schema: string; before: OrganisationRevision; after: OrganisationRevision;
 rows: Array<Record<string, JsonValue>>; summary: Record<string, unknown>; files: Record<string, FileIdentity>;
}
export interface OrganisationRequest {
 requestId: string; state: 'RECORDED' | 'NOT_RECORDED';
 input?: OrganisationSave | OrganisationReviewInput | OrganisationReleaseInput | OrganisationCompare;
 action?: 'save' | 'review' | 'release' | 'compare'; plan?: OrganisationPlan;
 result?: OrganisationPlan | OrganisationReleaseResult | OrganisationComparison;
}
export interface OrganisationReceiving {
 schema: 'stellar-forge.iati-organisation-receiving.v1'; state: 'COMPLETE';
 /** The revision selected by the received packet. */
 plan: OrganisationPlan;
 /** The current local head; later compatible local work remains here. */
 currentPlan: OrganisationPlan;
 plans: number; revisions: number; sources: number; comparisons: number;
 packet: FileIdentity; semantics: unknown;
}
