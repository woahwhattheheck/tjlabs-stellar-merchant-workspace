/** MIT. Complete award-administration records on the original grant-portfolio client. */
import type {ActionOptions,GrantPortfolioClient,JsonObject,OperationId,PortfolioSelection,
  RequestOptions,RetainedRequest,RowPage,Sha256} from "./client.mjs";
import type {ProgrammeChangeSet} from "./programme-client.mjs";
export declare const GRANT_AWARDS_SCHEMA:"stellar-forge.grant-awards.v1";
export declare const GRANT_AWARDS_COLLECTIONS:readonly AwardCollection[];
export type AwardId=string;
export type AwardCollection=keyof AwardFields;
export type AwardTable='awards_positions'|'awards_calculations'|`awards_${AwardCollection}`;
export interface AwardMoney {value:string;currency:string;}
export interface AwardSourceReference {sourceId:Sha256;entityKey:Sha256;sha256:Sha256;}
export interface AwardFinancialReference {sourceId:Sha256;rowKey:Sha256;sha256:Sha256;}
export interface AwardCommon {
  notes?:string;sourceRefs?:AwardSourceReference[];evidenceIds?:AwardId[];supersedesId?:AwardId|null;
}
export interface AwardCriterion {
  id:string;title:string;kind:'score'|'eligibility';required:boolean;
  minimum?:string|null;maximum?:string|null;weight?:string|null;guidance:string;
}
export interface AwardApplicantProfile {
  legalName:string;organisationIdentifier?:string|null;contactName?:string|null;
  contactEmail?:string|null;country?:string|null;summary:string;
}
export interface AwardAnswer {criterionId:string;response:string;}
export interface AwardCheckItem {
  criterionId?:string|null;title:string;outcome:'undetermined'|'pass'|'fail'|'query';reason:string;evidenceIds:AwardId[];
}
export interface AwardConflictDisclosure {state:'undisclosed'|'none'|'declared';details:string;evidenceIds:AwardId[];}
export interface AwardConflictResolution {outcome:'pending'|'clear'|'recused';decidedBy?:string|null;reason:string;date?:string|null;}
export interface AwardScore {criterionId:string;value?:string|null;reason:string;evidenceIds:AwardId[];}
export interface AwardPanelMember {member:string;role:string;conflictState:'none'|'declared'|'recused';reason:string;}
export interface AwardRoundFields extends AwardCommon {
  code:string;title:string;programmeNodeId:AwardId;owner:string;criteria:AwardCriterion[];
  opensDate?:string|null;closesDate?:string|null;process?:string;scoringMethod?:'none'|'weighted-sum';
  status:'draft'|'published'|'closed';
}
export interface AwardApplicationFields extends AwardCommon {
  roundId:AwardId;partnerId:AwardId;projectId?:AwardId|null;reference:string;title:string;
  applicantProfile:AwardApplicantProfile;answers?:AwardAnswer[];requestedAmount?:AwardMoney|null;
  submittedDate?:string|null;status:'draft'|'submitted'|'withdrawn';
}
export interface AwardCheckFields extends AwardCommon {
  applicationId:AwardId;kind:'eligibility'|'due-diligence';reviewer:string;
  outcome:'undetermined'|'pass'|'fail'|'query';items?:AwardCheckItem[];completedDate?:string|null;status:'draft'|'recorded';
}
export interface AwardAssignmentFields extends AwardCommon {
  applicationId:AwardId;assessor:string;assignedBy:string;assignedDate:string;
  conflictDisclosure:AwardConflictDisclosure;conflictResolution:AwardConflictResolution;status:'draft'|'confirmed';
}
export interface AwardAssessmentFields extends AwardCommon {
  assignmentId:AwardId;assessor:string;scores:AwardScore[];recommendation?:string;
  submittedDate?:string|null;status:'draft'|'submitted';
}
export interface AwardDecisionFields extends AwardCommon {
  applicationId:AwardId;assessmentIds?:AwardId[];checkIds?:AwardId[];panel?:AwardPanelMember[];
  outcome:'award'|'reject'|'reserve'|'defer';amount?:AwardMoney|null;reasons:string;decisionDate?:string|null;status:'draft'|'recorded';
}
export interface AwardAgreementFields extends AwardCommon {
  decisionId:AwardId;grantId:AwardId;agreementDocumentId:AwardId;recipientPartnerId:AwardId;
  amount?:AwardMoney|null;startDate?:string|null;endDate?:string|null;acceptedBy?:string|null;
  acceptedDate?:string|null;conditions?:string;status:'draft'|'recorded';
}
export interface AwardClaimFields extends AwardCommon {
  agreementId:AwardId;kind:'submission'|'review'|'reconciliation';claimId?:AwardId|null;owner:string;
  amount?:AwardMoney|null;outcome:'pending'|'approved'|'rejected'|'query'|'matched'|'disputed';
  financialRefs?:AwardFinancialReference[];recordedDate?:string|null;narrative?:string;status:'draft'|'recorded';
}
export interface AwardMonitoringFields extends AwardCommon {
  agreementId:AwardId;title:string;reportedBy:string;periodStart:string;periodEnd:string;
  observationIds?:AwardId[];milestoneIds?:AwardId[];outcome:'undetermined'|'on-track'|'action-required'|'complete';
  narrative?:string;actions?:string;status:'draft'|'recorded';
}
export interface AwardFields {
  rounds:AwardRoundFields;applications:AwardApplicationFields;checks:AwardCheckFields;
  assignments:AwardAssignmentFields;assessments:AwardAssessmentFields;decisions:AwardDecisionFields;
  agreements:AwardAgreementFields;claims:AwardClaimFields;monitoring:AwardMonitoringFields;
}
export interface AwardMetadata {
  id:AwardId;revision:number;createdAt:string;updatedAt:string;createdBy:string;updatedBy:string;sha256:Sha256;
  archived:boolean;archiveReason?:string;publication?:JsonObject;recording?:JsonObject;
}
export type AwardRecord<C extends AwardCollection=AwardCollection>=AwardFields[C]&AwardMetadata;
export type AwardChange<C extends AwardCollection=AwardCollection>={
  [K in C]:{collection:K;id:AwardId;expectedRevision:number;fields:Partial<AwardFields[K]>}
}[C];
export interface AwardArchive {collection:AwardCollection;id:AwardId;expectedRevision:number;reason:string;}
export interface AwardChangeSet {
  schema:typeof GRANT_AWARDS_SCHEMA;expectedAwardsRevision:number;actor:string;
  changes:AwardChange[];archive?:AwardArchive[];
}
export interface AwardModel {schema:typeof GRANT_AWARDS_SCHEMA;revision:number;records:{[K in AwardCollection]:AwardRecord<K>[]};}
export interface AwardReadEnvelope extends PortfolioSelection {
  schema:typeof GRANT_AWARDS_SCHEMA;snapshot:Sha256;awardsRevision:number;
}
export interface AwardRecordSelection<C extends AwardCollection=AwardCollection> extends PortfolioSelection {collection:C;id:AwardId;}
export interface AwardRecordRead<C extends AwardCollection=AwardCollection> extends AwardReadEnvelope {collection:C;record:AwardRecord<C>;}
export interface AwardHistoryRead<C extends AwardCollection=AwardCollection> extends AwardReadEnvelope {
  collection:C;id:AwardId;history:{portfolioRevision:number;snapshot:Sha256;operationId:OperationId;record:AwardRecord<C>}[];
}
export interface AwardRoundSelection extends PortfolioSelection {roundId:AwardId;}
export interface AwardPositionSelection extends PortfolioSelection {applicationId:AwardId;}
export interface AwardRoundRead extends AwardReadEnvelope {round:JsonObject;}
export interface AwardPositionRead extends AwardReadEnvelope {position:JsonObject;}
export interface AwardFinancialSelection extends PortfolioSelection {offset?:number;limit?:number;search?:string;}
export type AwardFinancialRead=RowPage<{record:JsonObject;reference:AwardFinancialReference}>&AwardReadEnvelope;
export declare function awardsBatch(actor:string,expectedAwardsRevision:number,changes?:AwardChange[],options?:{archive?:AwardArchive[]}):AwardChangeSet;
export declare function newAwardRecord<C extends AwardCollection>(collection:C,fields:AwardFields[C],id?:AwardId):AwardChange<C>;
export declare function reviseAwardRecord<C extends AwardCollection>(collection:C,record:AwardRecord<C>,fields:Partial<AwardFields[C]>):AwardChange<C>;
export declare function followingAwardRecord<C extends AwardCollection>(collection:C,record:AwardRecord<C>,fields:AwardFields[C],id?:AwardId):AwardChange<C>;
export declare function saveGrantAwards(client:GrantPortfolioClient,operationId:OperationId,selection:PortfolioSelection,
  awards:AwardChangeSet,options?:ActionOptions):Promise<RetainedRequest>;
export declare function saveProgrammeAndAwards(client:GrantPortfolioClient,operationId:OperationId,selection:PortfolioSelection,
  changes:{programme:ProgrammeChangeSet;awards:AwardChangeSet},options?:ActionOptions):Promise<RetainedRequest>;
