import type { Buffer } from 'node:buffer';
import type { Project, Selection, JsonObject, RevisionInput } from './workspace.mjs';

export const COMMISSIONING_SCHEMA:'stellar-forge.a2a-commissioning.v1';
export const PLAN_SCHEMA:'stellar-forge.a2a-customer-commissioning-plan.v1';
export type CommissioningContextKind='customer'|'reference';
export type CommissioningSourceRole='customer-approval'|'source-period'|'source-contract'|'receiving-evidence';
export type CommissioningDecision='accepted'|'changes_requested'|'rejected';
export type CommissioningBindingKind='buyer'|'merchant'|'period';
export interface CommissioningSource {
  id:string;sha256:string;bytes:number;filename:string;mediaType:string;role:string;
}
export interface PlannedRole {id:string;[key:string]:unknown}
export interface PlannedJob {
  id:string;buyer_id:string;merchant_id:string;calendar_day:number;title:string;purpose:string;
  task_kind:'approved-query'|'approved-report';required_selection:string;source_period_ids:string[];
  population_id:string;output_contract_id:string;planned_business_jobs:1;[key:string]:unknown;
}
export interface CommissioningPlan {
  schema:'stellar-forge.a2a-customer-commissioning-plan.v1';id:string;title:string;
  buyers:PlannedRole[];merchants:PlannedRole[];source_periods:PlannedRole[];
  output_contracts:Array<PlannedRole&{original_kind:'saved-query'|'saved-report'}>;
  jobs:PlannedJob[];[key:string]:unknown;
}
export interface PlanRecord {
  id:string;createdAt:string;requestId:string;planId:string;title:string;sourceId:string;
  sha256:string;bytes:number;jobCount:number;context:CommissioningContextKind;attribution:string;
}
export interface BuyerDetails {
  organization:string;accountableBuyer:string;receivingPerson:string;population:string;independenceBasis:string;
}
export interface MerchantDetails {
  organization:string;installationId:string;serviceUrl:string;accountableOperator:string;
}
export interface PeriodDetails {
  startsAt:string;endsAt:string;sourceEditionId:string;sourceIds:string[];licenseBasis:string;population:string;
}
export interface ApprovalBase {
  id:string;createdAt:string;requestId:string;planId:string;key:string;evidence:CommissioningSource[];
  sourceFiles:CommissioningSource[];reason:string;sha256:string;
}
export type ApprovalRecord=ApprovalBase&(
  {kind:'buyer';details:BuyerDetails}|{kind:'merchant';details:MerchantDetails}|{kind:'period';details:PeriodDetails}
);
export interface ObservedView {name:string;version_id:string;revision:number;[key:string]:unknown}
export interface ObservedProcedure {
  id:string;name:string;kind:'query'|'report';workspace:string;workspaceId:string;
  views:ObservedView[];formats:string[];procedureSha256:string;parametersAllowed:boolean;
  query?:{name:string;revision:number;[key:string]:unknown};
  report?:{name:string;revision:number;sha256:string;[key:string]:unknown};
  [key:string]:unknown;
}
export interface ViewPeriodSelection {name:string;periodIds:string[]}
export interface PinnedViewPeriod extends ViewPeriodSelection {versionId:string;revision:number}
export interface PreparationRecord {
  id:string;createdAt:string;requestId:string;planId:string;planSha256:string;jobId:string;
  mode:'prepared'|'adopted';scheduledDate:string;catalogueEditionId:string;
  catalogueSourceId:string;catalogueSha256:string;procedure:ObservedProcedure;parametersText:string|null;
  selection:Selection;approvals:Array<{id:string;sha256:string}>;viewPeriods:PinnedViewPeriod[];
  evidence:CommissioningSource[];reason:string;receivingPerson:string;messageId:string;
  originalMessageCreatedAt:string;supersedes:string|null;sha256:string;
}
export interface NativeDeliveryIdentity {
  taskId:string;contextId:string;observationId:string;observationSha256:string;editionId:string;
  editionRevision:number;captureId:string;analysisSourceId:string;analysisSha256:string;
  originalWorkspaceId:string;procedureSha256:string;nativeJobs:Array<Record<string,unknown>>;
  files:Array<{artifactId:string|null;index:number;sourceId:string;filename:string;mediaType:string;sha256:string;bytes:number}>;
}
export interface CommissioningPublication {
  id:string;editionId:string;assetSha256:string;assetBytes:number;service:JsonObject;
  paymentAuthority:'original-sf30-x402';
}
export interface DeliveryRecord {
  id:string;createdAt:string;requestId:string;planId:string;jobId:string;preparationId:string;taskKey:string;
  native:NativeDeliveryIdentity;publication:CommissioningPublication|null;receivingPerson:string;recordedBy:string;
  decision:CommissioningDecision;note:string;evidence:CommissioningSource[];
  settlementStatus:'not_evaluated';paymentAuthority:string;sha256:string;
}
export interface CommissioningState {
  schema:'stellar-forge.a2a-commissioning.v1';plans:PlanRecord[];approvals:ApprovalRecord[];
  preparations:PreparationRecord[];deliveries:DeliveryRecord[];
}
export interface CommissionedJob extends PlannedJob {
  preparation:PreparationRecord|null;delivery:DeliveryRecord|null;
  messageState:{id:string;nativeMessageId:string;attempted:boolean;operationState:string|null;
    taskIds:string[];approvalChanged:boolean}|null;
  state:string;
}
export interface CommissioningCounts {
  plans?:number;jobs:number;prepared:number;observedTasks:number;accepted:number;
  acceptedPrepared?:number;acceptedAdopted?:number;verifiedSettlements?:null;
}
export interface CommissionedPlan extends PlanRecord {
  plan:CommissioningPlan;approvals:ApprovalRecord[];jobs:CommissionedJob[];counts:CommissioningCounts;
}
export interface CatalogueView {
  editionId:string;title:string;sourceId?:string;sha256?:string;selection?:Selection;
  error?:string;procedures:ObservedProcedure[];
}
export interface CommissioningView {
  schema:'stellar-forge.a2a-commissioning.v1';plans:CommissionedPlan[];catalogues:CatalogueView[];
  counts:CommissioningCounts;authority?:string;
}
export interface CommissioningReport {
  schema:'stellar-forge.a2a-commissioning-report.v1';projectId:string;revision:number;historical:boolean;
  workspaceId:string;commissioning:CommissioningView;
}
export interface ImportPlanInput extends RevisionInput {
  contentBase64:string;filename:string;title?:string;context:CommissioningContextKind;attribution:string;
}
export interface RetainCommissioningSourceInput extends RevisionInput {
  contentBase64:string;filename:string;mediaType:string;role:CommissioningSourceRole;note:string;
}
export type ApproveBindingInput=RevisionInput&{
  planId:string;key:string;evidenceSourceIds:string[];reason:string;
}&({kind:'buyer';details:BuyerDetails}|{kind:'merchant';details:MerchantDetails}|{kind:'period';details:PeriodDetails});
export interface PrepareJobInput extends RevisionInput {
  planId:string;jobId:string;catalogueEditionId:string;procedureId:string;scheduledDate:string;
  parametersText?:string|null;viewPeriods:ViewPeriodSelection[];evidenceSourceIds:string[];reason:string;
  messageId?:string;
}
export interface ReviewDeliveryInput extends RevisionInput {
  preparationId:string;editionId:string;publicationId?:string;decision:CommissioningDecision;
  evidenceSourceIds:string[];note:string;
}
export interface CommissioningActionPayloads {
  commission_import_plan:ImportPlanInput;
  commission_retain_source:RetainCommissioningSourceInput;
  commission_approve_binding:ApproveBindingInput;
  commission_prepare_job:PrepareJobInput;
  commission_review_delivery:ReviewDeliveryInput;
}
export const COMMISSIONING_ACTIONS:ReadonlySet<keyof CommissioningActionPayloads>;
export interface CommissioningSourceContext {
  read(sha256:string):Buffer;
  /** Returns the original validated result packet for the edition's fixed revision. */
  result(project:Project,editionId:string):JsonObject;
}
export function validateCommissioningPlan(value:unknown):CommissioningPlan;
export function commissioningTemplate():{bytes:Buffer;sha256:string;filename:string;mediaType:string};
export function commissioningMessageInput(project:Project,input:PrepareJobInput,context:CommissioningSourceContext):
  {message:{messageId:string;role:'ROLE_USER';parts:Array<{data:JsonObject}>};configuration:JsonObject;metadata:JsonObject}|null;
export function assertCommissioningSend(project:Project,messageId:string):void;
export function validateCommissioning(project:Project,context:CommissioningSourceContext):void;
export function commissioningView(project:Project,context:CommissioningSourceContext):CommissioningView;
