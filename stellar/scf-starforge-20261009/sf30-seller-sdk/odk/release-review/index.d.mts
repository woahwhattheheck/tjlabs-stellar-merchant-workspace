// MIT. Exact source, reporting and staff interfaces for the Central release desk.
import type {CentralWorkspace,CentralExtensionStore,CentralServerExtension,CentralWorkspaceExtension} from '../index.mjs';
export type FormRecord=Record<string,unknown>;
export interface OriginalFileReceipt extends FormRecord {sha256:string;bytes:number;outcome?:string}
export interface NativeFormField extends FormRecord {path:string;type:string;name?:string;binary?:boolean}
export interface FormIdentity extends FormRecord {
  connectionId?:string;projectId:string|number;formId:string;
  /** Keep the original version string; an empty string is a real native version. */
  version:string;title?:string;providerHash?:string|null;
}
export interface ReportingBinding {table:string;field:string;path:string}
export interface ReportingTableBinding {table:string;path:string}
export interface ReportingSelector extends FormRecord {
  table:string;field:string;system?:boolean;nativePath?:string|null;
}
export interface ReportingTable extends FormRecord {
  table:string;scope?:'form'|'repeat';relation?:unknown;nativePath?:string|null;
}
export interface ReportingDependency extends FormRecord {
  id:string;kind:string;label?:string;definitionHash?:string;
  selectors?:ReportingSelector[];tables?:ReportingTable[];source?:FormRecord;
}
export interface FormSourceInput extends FormRecord {
  form:FormIdentity;origin:FormRecord;xml:OriginalFileReceipt;
  fields:Partial<OriginalFileReceipt>&{values:NativeFormField[]};
  model?:FormRecord|null;modelSource?:OriginalFileReceipt|null;
  media?:{complete:boolean;items:(FormRecord&{name:string;sha256?:string|null;bytes?:number|null})[];[key:string]:unknown};
  reporting?:FormRecord|null;history?:FormSourceInput[];coverage?:FormRecord;
}
export interface FormSource extends FormSourceInput {
  schema:typeof FORM_SOURCE_SCHEMA;contentHash:string;
}
export interface RetainedFormSource extends FormSource {
  id:string;revision:number;title:string;request:FormRecord;createdAt:string;updatedAt:string;
}
export type FormChangeSeverity='incompatible'|'review'|'compatible'|'information';
export interface FormChange extends FormRecord {
  id:string;kind:string;severity:FormChangeSeverity;summary:string;path:string|null;
  before:unknown;after:unknown;dependencies:(ReportingDependency&{selector?:string})[];detail?:string;
}
export interface FormImpactSummary {
  changes:number;incompatible:number;review:number;compatible:number;information:number;affectedOutputs:number;
}
export interface ReportingInventory {
  dependencies:ReportingDependency[];bindings:ReportingBinding[];tableBindings:ReportingTableBinding[];
  fieldChoices:{path:string;type:string}[];repeatChoices:{path:string;type:string}[];
  tableChoices:{table:string;path:string|null;scope:'form'|'repeat';relation:unknown;
    dependencies:{id:string;kind:string;label?:string}[]}[];
  omittedBindings:({kind:'field'|'table';table:string;field?:string;path:string;reason:string})[];
  unmapped:FormRecord[];unmappedTables:FormRecord[];
}
export interface FormImpact extends FormRecord {
  schema:typeof FORM_IMPACT_SCHEMA;contentHash:string;baselineHash:string;candidateHash:string;
  dependencyHash:string;historical:FormRecord[];bindings:ReportingBinding[];tableBindings:ReportingTableBinding[];
  changes:FormChange[];coverage:{facet:string;baseline:string;candidate:string}[];
  reporting:ReportingInventory;summary:FormImpactSummary;
}
export interface FormDisposition {changeId:string;decision:'accept'|'remap'|'revise';note:string}
export interface SavedFormDisposition extends FormDisposition {reviewer:string;at:string;assessmentHash:string}
export interface FormReleaseReadiness {
  canApprove:boolean;unresolvedChangeIds:string[];incompatibleChangeIds:string[];
  staleDependencies:FormRecord[];dependenciesChanged:boolean;currentDependencyHash:string;
}
export interface FormReleaseApproval {
  planId:string;planHash:string;assessmentHash:string;reviewer:string;at:string;note:string;
}
export interface FormReleaseReview extends FormRecord {
  schema:typeof FORM_REVIEW_SCHEMA;id:string;revision:number;name:string;status:string;
  baselineId:string;candidateId:string;assessment:FormImpact;decisions:SavedFormDisposition[];
  approval:FormReleaseApproval|null;history:FormRecord[];readiness:FormReleaseReadiness;
  reporting:ReportingInventory;createdAt:string;updatedAt:string;
  colleague:{packages:FormColleagueSummary[];returns:FormColleagueSummary[]};
}
export interface FormPublicationPlan extends FormRecord {
  schema:typeof FORM_PLAN_SCHEMA;id:string;revision:number;contentHash:string;
  reviewId:string;assessmentHash:string;baseline:FormRecord;candidate:FormRecord;
  target:{connectionId:string|null;projectId:string|number;formId:string;expectedPublishedVersion:string;
    expectedPublishedXml:string;candidateVersion:string;publishVersionParameter:null};
  dependencyHash:string;reporting:ReportingInventory;historical:FormRecord[];
  decisions:SavedFormDisposition[];approvedBy:string;approvedAt:string;note:string;
}
export interface FormPublicationReceiving extends FormRecord {
  id:string;revision:number;planId:string;reviewId:string;outcome:'MATCHED'|'RECEIVED_DIFFERENT';
  differences:string[];source:FormSource;receivedAt:string;
}
export interface CentralFormAuthoring {
  resolveCandidate(input:{id:string;expectedRevision:number}):Promise<FormSourceInput>|FormSourceInput;
  listCandidates?():Promise<{id:string;revision:number;title?:string;version:string}[]>|
    {id:string;revision:number;title?:string;version:string}[];
}
export interface CentralFormReleaseState extends FormRecord {
  schema:typeof FORM_REVIEW_SCHEMA;workspaceId:string;capabilities:{authoring:boolean;draft:true};
  captures:{id:string;name:string;status:string;forms:{key:string;projectId:string|number;formId:string;name?:string;
    generations:{version:string;received:boolean}[]}[]}[];
  snapshots:Pick<RetainedFormSource,'id'|'revision'|'title'|'form'|'origin'|'contentHash'|'createdAt'>[];
  reviews:(Pick<FormReleaseReview,'id'|'revision'|'name'|'status'|'baselineId'|'candidateId'|'updatedAt'|'readiness'>&
    {assessment:{summary:FormImpactSummary}})[];
  publications:FormRecord[];authoringCandidates:{id:string;revision:number;title?:string;version:string}[];
  activeOperations:number;
}
export interface CentralFormReleaseReview {
  exportColleague(input:{id:string;expectedRevision:number;packageId:string}):Promise<FormColleagueSummary>;
  receiveColleague(input:{id:string;reviewId:string;originalText:string}):Promise<FormColleaguePreview>;
  receiveColleagueFile(input:{id:string;reviewId:string;sourceSha256:string}):Promise<FormColleaguePreview>;
  receiveColleagueStream(input:{id:string;reviewId:string},stream:AsyncIterable<Uint8Array>):Promise<FormColleaguePreview>;
  previewColleague(input:{id:string}):Promise<FormColleaguePreview>;
  applyColleague(input:FormColleagueApply):Promise<FormColleagueApplied>;
  state():Promise<CentralFormReleaseState>;
  getSource(input:{id:string}):RetainedFormSource;
  getReview(input:{id:string}):FormReleaseReview;
  retainCapture(input:{id:string;captureId:string;formKey:string;version:string}):Promise<RetainedFormSource>;
  retainDraft(input:{id:string;baselineId:string}):Promise<RetainedFormSource>;
  retainAuthoring(input:{id:string;authoringId:string;expectedRevision:number}):Promise<RetainedFormSource>;
  retainSource(input:{id:string;source:FormSourceInput;request?:FormRecord;title?:string}):Promise<RetainedFormSource>;
  createReview(input:{id:string;name?:string;baselineId:string;candidateId:string;
    bindings?:ReportingBinding[];tableBindings?:ReportingTableBinding[]}):FormReleaseReview;
  mapReports(input:{id:string;expectedRevision:number;reviewer:string;note:string;
    bindings:ReportingBinding[];tableBindings?:ReportingTableBinding[]}):FormReleaseReview;
  decide(input:{id:string;expectedRevision:number;reviewer:string;note:string;
    decisions:FormDisposition[];overall?:'review'|'approve'|'revise'}):FormReleaseReview;
  publicationPlan(input:{id:string;expectedRevision?:number}):FormPublicationPlan;
  validatePublicationPlan(input:{planId:string;candidateContentHash:string;target:FormPublicationPlan['target']}):FormPublicationPlan;
  receivePublication(input:{id:string;planId:string;source:FormSourceInput}):Promise<FormPublicationReceiving>;
}
export const FORM_SOURCE_SCHEMA:'stellar-forge.odk-form-source.v1';
export const FORM_IMPACT_SCHEMA:'stellar-forge.odk-form-impact.v1';
export const FORM_REVIEW_SCHEMA:'stellar-forge.odk-form-release-review.v1';
export const FORM_PLAN_SCHEMA:'stellar-forge.odk-form-publication-plan.v1';
export function normalizeFormSource(input:FormSourceInput):FormSource;
export function formIdentity(form:FormIdentity):string;
export function normalizeReportingBindings(values?:ReportingBinding[]):ReportingBinding[];
export function normalizeReportingTableBindings(values?:ReportingTableBinding[]):ReportingTableBinding[];
export function reportingInventory(input:{baseline:FormSourceInput;candidate:FormSourceInput;
  dependencies?:ReportingDependency[];bindings?:ReportingBinding[];tableBindings?:ReportingTableBinding[]}):ReportingInventory;
export function compareFormSources(input:{baseline:FormSourceInput;candidate:FormSourceInput;historical?:FormSourceInput[];
  dependencies?:ReportingDependency[];bindings?:ReportingBinding[];tableBindings?:ReportingTableBinding[]}):FormImpact;
export function receiveCentralDraft(input:{store:CentralExtensionStore;baseline:RetainedFormSource;
  fetchImpl?:typeof fetch;signal?:AbortSignal}):Promise<FormSourceInput>;
export function createCentralFormReleaseReview(input:{workspace:CentralWorkspace;store:CentralExtensionStore;
  authoring?:CentralFormAuthoring;fetchImpl?:typeof fetch}):CentralFormReleaseReview;
export function createCentralFormReleaseExtension(input:{review:CentralFormReleaseReview}):CentralServerExtension;
export interface OpenCentralFormReleaseReview {
  workspace:CentralWorkspace;review:CentralFormReleaseReview;extensions:CentralServerExtension[];close():Promise<void>;
}
export function openCentralFormReleaseReview(input:{directory:string;fetchImpl?:typeof fetch;
  extend?:CentralWorkspaceExtension;authoring?:CentralFormAuthoring}):Promise<OpenCentralFormReleaseReview>;
export function composeCentralFormReleaseReview(input:{workspace:CentralWorkspace;store:CentralExtensionStore;
  authoring?:CentralFormAuthoring;fetchImpl?:typeof fetch}):{review:CentralFormReleaseReview;extension:CentralServerExtension};

// Complete colleague files and feedback remain bound to the original review.
export interface FormColleaguePackage extends FormRecord {
 schema:typeof FORM_COLLEAGUE_PACKAGE_SCHEMA;id:string;workspaceId:string;reviewId:string;reviewRevision:number;
 createdAt:string;review:FormReleaseReview;sources:{baseline:RetainedFormSource;candidate:RetainedFormSource};
 files:{sha256:string;bytes:number;base64:string;names:{sourceId:string;side:string;name:string;label:string}[]}[];
 fileCoverage:{nativeOnly:{sourceId:string;side:string;label:string;receipt:OriginalFileReceipt;reason:string}[]};
 contentHash:string;
}
export interface FormColleagueDraft {reviewer:string;note:string;decisions:FormDisposition[]}
export interface FormColleagueEdition extends FormColleagueDraft {id:string;createdAt:string}
export interface FormColleagueWork {
 schema:typeof FORM_COLLEAGUE_RETURN_SCHEMA;package:FormColleaguePackage;draft:FormColleagueDraft;editions:FormColleagueEdition[];
}
export interface FormColleagueSummary extends FormRecord {
 id:string;reviewId:string;packageId:string;createdAt:string;status:string;
 source:OriginalFileReceipt;html?:OriginalFileReceipt;reviewer:string|null;editionCount:number;applied:FormRecord|null;
}
export interface FormColleaguePreview extends FormColleagueSummary {
 currentRevision:number;originalRevision:number;sourceMatches:boolean;dependenciesMatch:boolean;canApply:boolean;previewHash:string;
 draft:FormColleagueDraft;editions:FormColleagueEdition[];
 rows:{change:FormChange;original:FormDisposition|null;current:FormDisposition|null;colleague:FormDisposition|null;
 different:boolean;proposed:boolean;nativeChanged:boolean;incomplete:boolean}[];
 currentApproval:FormReleaseApproval|null;currentStatus:string;message:string;
}
export interface FormColleagueApply {
 id:string;expectedRevision:number;previewHash:string;reviewer:string;note:string;overall?:'review'|'revise';
 choices:{changeId:string;source:'current'|'colleague'}[];
}
export interface FormColleagueApplied {receiving:FormColleagueSummary;review:FormReleaseReview;applied:FormRecord;replayed:boolean}
export const FORM_COLLEAGUE_PACKAGE_SCHEMA:'stellar-forge.odk-form-colleague-package.v1';
export const FORM_COLLEAGUE_RETURN_SCHEMA:'stellar-forge.odk-form-colleague-return.v1';
