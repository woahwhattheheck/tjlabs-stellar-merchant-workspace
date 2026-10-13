export type JsonValue = null | boolean | number | string | JsonValue[] | {[key:string]:JsonValue};
export type JsonObject = {[key:string]:JsonValue};
export type IdentityKind = 'buyer' | 'merchant' | 'operation' | 'facilitator';
export interface DeliveryIdentityLink { kind:IdentityKind; plannedId:string; observedId:string; note:string }
export interface DeliveryIntentAssignment { intentId:string; targetId:string; note:string }
export interface DeliveryRecording { editionId:string; createdAt:string; actor:string; planSourceId:string }
export interface CohortDeliveryInput {
  schema:'stellar-forge.sf47-cohort-delivery-input.v1';planDocument:JsonObject;review:JsonObject;
  links:DeliveryIdentityLink[];assignments:DeliveryIntentAssignment[];title:string;note:string;recording:DeliveryRecording;
}
export interface DeliveryJoin {
  kind:IdentityKind;plannedId:string;plannedLabel:string;observedId:string|null;observedLabel:string|null;
  basis:'ORIGINAL_IDENTITY'|'OPERATOR_ASSOCIATION'|'UNMATCHED';note:string;
  plannedOperatorId:string|null;observedOperatorId:string|null;sourceIds:string[];
}
export interface DeliveryRecord {
  id:string;intentId:string|null;purchaseIds:string[];buyerOperatorId:string|null;
  buyerDeploymentId:string|null;operationId:string|null;merchantDeploymentId:string|null;facilitatorId:string|null;
  network:string;asset:string|null;firstAttemptAt:string|null;firstAttemptDate:string|null;
  currentCompletedAt:string|null;completionDate:string|null;targetId:string|null;
  placement:'OPERATOR_ASSIGNMENT'|'ORIGINAL_IDENTITIES_AND_UTC_DATE'|'AMBIGUOUS_DATE'|'DATE_UNMATCHED'|'IDENTITY_UNMATCHED';
  candidateGroupId:string|null;assignmentNote:string;attempted:boolean;settled:boolean;inWindow:boolean;unplaced:boolean;
  completeInWindow:boolean;independentCompleteInWindow:boolean;grossCompleteInWindow:boolean;laterCompletion:boolean;
  refundedAfterSettlement:boolean;cancelledAfterSettlement:boolean;teamOperated:boolean;lateAfterPlan:boolean;
  latenessSeconds:string|null;sourceIssues:string[];sourceIds:string[];
}
export interface DeliveryOpportunity {
  id:string;kind:'OCCURRENCE'|'FUNDING_GROUP';sourceId:string;label:string;scheduleId:string|null;
  operationId:string;buyerId:string;merchantId:string;facilitatorId:string|null;date:string;scheduledAt:string;
  plannedCompleteAt:string|null;paymentKind:string;network:string;asset:string;
  plannedPaymentRequests:number;plannedPaidPurchases:number;plannedCompletePurchases:number;independentPurchaseOpportunities:number;
  plannedUsefulTasks:number;atomicAmount:string|null;sourceOccurrenceIds:string[];
  observedOperationId:string|null;observedBuyerId:string|null;observedMerchantId:string|null;observedFacilitatorId:string|null;
  dueAtCutoff:boolean;intentIds:string[];observedIntents:number;observedAttempted:number;observedComplete:number;
  observedIndependentComplete:number;grossComplete:number;refunded:number;cancelledAfterSettlement:number;lateAfterPlan:number;
  completionDelta:number;remainingDue:number;additionalIntents:number;state:string;note:string;
}
export interface DeliveryDay {date:string;plannedPaymentRequests:number;plannedCompletePurchases:number;plannedUsefulTasks:number;
  observedIntents:number;completedFromAttempts:number;completedOnDate:number;independentCompletedOnDate:number;lateAfterPlan:number;unmatchedIntents:number}
export interface DeliveryOperator {operatorId:string|null;labels:string[];plannedBuyerIds:string[];observedBuyerIds:string[];
  plannedPaidPurchases:number;plannedIndependentOpportunities:number;observedIntents:number;observedComplete:number;observedIndependentComplete:number;unmatchedIntents:number}
export interface DeliveryTarget {key:string;plannedRequirement:number|null;observedRequirement:number|null;planned:number|null;observed:number|null;observedMet:boolean|null;delta:number|null;planningStatus:string|null}
export interface DeliveryFinding {code:string;message:string;id?:string;kind?:string;blocking?:boolean}
export interface DeliverySource {programId:string;plan:JsonObject;reviewId:string;reviewVersion:number;measurementSha256:string;previewSha256:string;observed:JsonObject;plannedWindow:JsonObject;observedWindow:JsonObject;nativeMode:string}
export interface CohortDeliveryComparison {
  schema:'stellar-forge.sf47-cohort-delivery-comparison.v1';engineVersion:1;title:string;input:CohortDeliveryInput;
  summary:{[key:string]:number|boolean};source:DeliverySource;planReport:JsonObject;joins:DeliveryJoin[];rows:DeliveryOpportunity[];
  records:DeliveryRecord[];unmatched:DeliveryRecord[];candidateGroups:Array<{id:string;targetIds:string[]}>;days:DeliveryDay[];operators:DeliveryOperator[];targets:DeliveryTarget[];
  issues:DeliveryFinding[];nativeMetrics:JsonObject;nativeIssues:DeliveryFinding[];amounts:JsonObject[];outcomes:JsonObject[];products:JsonObject[];
}
export const COHORT_DELIVERY_INPUT_SCHEMA:'stellar-forge.sf47-cohort-delivery-input.v1';
export const COHORT_DELIVERY_COMPARISON_SCHEMA:'stellar-forge.sf47-cohort-delivery-comparison.v1';
export class CohortDeliveryError extends Error {code:string;path:string;constructor(code:string,message:string,path?:string)}
export function seedCohortDeliveryComparison(planDocument:unknown,review:unknown,options?:Partial<DeliveryRecording>&{title?:string;note?:string}):CohortDeliveryInput;
export function compareCohortDelivery(input:CohortDeliveryInput):CohortDeliveryComparison;
export function reopenCohortDeliveryComparison(document:unknown):CohortDeliveryComparison;
export function exportCohortDeliveryCsv(document:CohortDeliveryComparison):string;
export function exportCohortDeliveryHtml(document:CohortDeliveryComparison):string;
