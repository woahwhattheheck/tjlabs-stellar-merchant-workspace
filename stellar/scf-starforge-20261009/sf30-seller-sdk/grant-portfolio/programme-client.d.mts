import type {DonorSelection} from "./donor-reporting-client.mjs";
/** Programme domain on the original portfolio/source/revision contract. */
import type {
  GrantPortfolioClient, OperationId, PortfolioSelection, RequestOptions, ActionOptions,
  RetainedRequest, ReviewReference, JsonObject, FileDescriptor,
} from './client.mjs';

export type ProgrammeId = string;
export type ProgrammeCollection = 'nodes'|'partners'|'grants'|'milestones'|'indicators'|
  'observations'|'risks'|'issues'|'documents'|'reports'|'closures';
export type ProgrammeTable = `programme_${ProgrammeCollection|'bindings'|'positions'|'results'}`;
export interface ProgrammeCommon { notes?:string; sourceRefs?:ReviewReference[]; }
export interface ProgrammeMetadata {
  id:ProgrammeId; revision:number; createdAt:string; updatedAt:string; updatedBy:string;
  sha256:string; archived:boolean; archiveReason:string;
}
export interface ProgrammeMoney { value:string; currency:string; }
export interface ProgrammeDocumentFile extends FileDescriptor { contentType:string; }
export interface ProgrammePoint {
  date:string; value:string; dimensions?:Record<string,string>; documentIds?:ProgrammeId[];
}
export interface ProgrammeNodeFields extends ProgrammeCommon {
  kind:'portfolio'|'programme'|'project'; code:string; title:string; owner:string;
  parentId?:ProgrammeId|null; division?:string|null; description?:string; countries?:string[];
  startDate?:string|null; endDate?:string|null; dataManagementRequired?:boolean|null;
  dataManagementBasis?:string; corporateProjectReference?:string|null;
  corporateRegistrationMode?:'unrecorded'|'manual'|'api';
  corporateRegistrationEvidence?:ProgrammeId[]; hrReference?:string|null;
}
export interface ProgrammePartnerFields extends ProgrammeCommon {
  code:string; name:string; organizationIdentifier?:string|null; roles?:string[];
  country?:string|null; contactName?:string|null; contactEmail?:string|null;
  dueDiligenceDocumentIds?:ProgrammeId[]; description?:string;
}
export interface ProgrammeGrantFields extends ProgrammeCommon {
  code:string; title:string; projectId:ProgrammeId; owner:string; parentGrantId?:ProgrammeId|null;
  recipientId?:ProgrammeId|null; applicantIds?:ProgrammeId[]; agreementId?:ProgrammeId|null;
  amendmentIds?:ProgrammeId[]; dueDiligenceDocumentIds?:ProgrammeId[];
  startDate?:string|null; endDate?:string|null; award?:ProgrammeMoney|null; purpose?:string;
}
export interface ProgrammeScope { nodeId:ProgrammeId; grantId?:ProgrammeId|null; }
export interface ProgrammeMilestoneFields extends ProgrammeCommon, ProgrammeScope {
  code:string; title:string; owner:string; dueDate:string;
  startDate?:string|null; completedDate?:string|null;
  status:'planned'|'in-progress'|'submitted'|'complete'|'cancelled'; progress?:string;
  dependencyIds?:ProgrammeId[]; documentIds?:ProgrammeId[]; description?:string;
}
export interface ProgrammeIndicatorFields extends ProgrammeCommon, ProgrammeScope {
  code:string; title:string; owner:string; resultLevel:'input'|'output'|'outcome'|'impact';
  parentIndicatorId?:ProgrammeId|null; unit:string; aggregation:'sum'|'latest'|'none';
  direction:'increase'|'decrease'|'maintain'; baseline?:ProgrammePoint[]; targets?:ProgrammePoint[];
  methodology?:string; documentIds?:ProgrammeId[];
}
export interface ProgrammeObservationFields extends ProgrammeCommon {
  indicatorId:ProgrammeId; periodStart:string; periodEnd:string; reportedDate:string;
  value?:string|null; dimensions?:Record<string,string>; status:'reported'|'withdrawn';
  documentIds?:ProgrammeId[]; collector:string;
}
export interface ProgrammeRiskFields extends ProgrammeCommon, ProgrammeScope {
  title:string; category:string; owner:string; likelihood:number; impact:number;
  residualLikelihood?:number|null; residualImpact?:number|null; reviewDate:string;
  status:'open'|'mitigating'|'closed'; mitigation?:string; documentIds?:ProgrammeId[]; description?:string;
}
export interface ProgrammeIssueFields extends ProgrammeCommon, ProgrammeScope {
  title:string; owner:string; severity:'low'|'medium'|'high'|'critical'; dueDate:string;
  status:'open'|'in-progress'|'resolved'|'closed'; action?:string; resolution?:string; documentIds?:ProgrammeId[];
}
export interface ProgrammeDocumentFields extends ProgrammeCommon, ProgrammeScope {
  title:string; category:'alignment-evidence'|'validation-minutes'|'needs-assessment'|'stakeholder-map'|
    'lessons'|'theory-of-change'|'concept-note'|'mel-plan'|'data-management-plan'|'risk-ser-plan'|
    'communications-plan'|'workplan-budget'|'donor-due-diligence'|'agreement'|'amendment'|
    'minutes'|'report'|'audit'|'closure'|'other';
  owner:string; uri?:string|null; object?:ProgrammeDocumentFile|null; sourceEdition?:string|null;
  documentDate?:string|null; replacesId?:ProgrammeId|null; status:'working'|'current'|'superseded';
  description?:string; content?:string;
}
export interface ProgrammeReportFields extends ProgrammeCommon, ProgrammeScope {
  title:string; owner:string; periodStart:string; periodEnd:string; dueDate:string;
  status:'draft'|'submitted'|'acknowledged'; submittedDate?:string|null; recipient?:string|null;
  documentIds?:ProgrammeId[]; narrative?:string; donorSelection?:DonorSelection|null;
}
export interface ProgrammeClosureFields extends ProgrammeCommon, ProgrammeScope {
  title:string; owner:string; closedDate:string; documentIds?:ProgrammeId[]; lessonDocumentIds?:ProgrammeId[];
  remainingIssueIds?:ProgrammeId[]; summary?:string; status:'prepared'|'recorded';
}
export interface ProgrammeFields {
  nodes:ProgrammeNodeFields; partners:ProgrammePartnerFields; grants:ProgrammeGrantFields;
  milestones:ProgrammeMilestoneFields; indicators:ProgrammeIndicatorFields;
  observations:ProgrammeObservationFields; risks:ProgrammeRiskFields; issues:ProgrammeIssueFields;
  documents:ProgrammeDocumentFields; reports:ProgrammeReportFields; closures:ProgrammeClosureFields;
}
export type ProgrammeRecord<C extends ProgrammeCollection = ProgrammeCollection> =
  ProgrammeMetadata & ProgrammeFields[C] & {publication?:JsonObject; positionAtRecording?:JsonObject};
export type ProgrammeChange<C extends ProgrammeCollection = ProgrammeCollection> = {
  [K in C]: {collection:K; id:ProgrammeId; expectedRevision:number; fields:Partial<ProgrammeFields[K]>}
}[C];
export interface ProgrammeArchive {
  collection:ProgrammeCollection; id:ProgrammeId; expectedRevision:number; reason:string;
}
export interface ProgrammeSettings { asOf:string; riskScaleMaximum:number; highRiskScore:number; }
export interface ProgrammeChangeSet {
  schema:'stellar-forge.grant-programme.v1'; expectedProgrammeRevision:number; actor:string;
  changes?:ProgrammeChange[]; archive?:ProgrammeArchive[]; settings?:Partial<ProgrammeSettings>;
}
export interface ProgrammeModel {
  schema:'stellar-forge.grant-programme.v1'; revision:number; settings:ProgrammeSettings;
  records:{[C in ProgrammeCollection]:ProgrammeRecord<C>[]};
}
export interface ProgrammeRecordSelection extends PortfolioSelection { collection:ProgrammeCollection; id:ProgrammeId; }
export interface ProgrammeScopeSelection extends PortfolioSelection { nodeId:ProgrammeId; grantId?:ProgrammeId; }
export interface ProgrammeDocumentSelection extends PortfolioSelection { id:ProgrammeId; }
export interface ProgrammeEnvelope extends PortfolioSelection {
  schema:'stellar-forge.grant-programme.v1'; snapshot:string; programmeRevision:number;
}
export interface ProgrammeRecordRead extends ProgrammeEnvelope {
  collection:ProgrammeCollection; record:ProgrammeRecord;
}
export interface ProgrammeHistoryRead extends ProgrammeEnvelope {
  collection:ProgrammeCollection; id:ProgrammeId;
  history:{portfolioRevision:number; snapshot:string; operationId:OperationId; record:ProgrammeRecord}[];
}
export interface ProgrammePositionRead extends ProgrammeEnvelope { position:JsonObject; }
export interface ProgrammeQaRead extends ProgrammeEnvelope { qa:JsonObject; }

export declare const GRANT_PROGRAMME_SCHEMA:'stellar-forge.grant-programme.v1';
export declare const GRANT_PROGRAMME_COLLECTIONS:readonly ProgrammeCollection[];
export declare function saveGrantProgramme(client:GrantPortfolioClient, operationId:OperationId,
  selection:PortfolioSelection, programme:ProgrammeChangeSet, options?:ActionOptions):Promise<RetainedRequest>;
export declare function createGrantProgramme(client:GrantPortfolioClient, operationId:OperationId,
  input:{name:string; notes?:string; reviewer:string; sources?:string[]; programme:ProgrammeChangeSet},
  options?:ActionOptions):Promise<RetainedRequest>;
export declare function newProgrammeRecord<C extends ProgrammeCollection>(
  collection:C, fields:ProgrammeFields[C], id?:ProgrammeId):ProgrammeChange<C>;
export declare function reviseProgrammeRecord<C extends ProgrammeCollection>(
  collection:C, record:ProgrammeRecord<C>, fields:Partial<ProgrammeFields[C]>):ProgrammeChange<C>;
export declare function programmeBatch(actor:string, expectedProgrammeRevision:number,
  changes:ProgrammeChange[], options?:{archive?:ProgrammeArchive[]; settings?:Partial<ProgrammeSettings>}):ProgrammeChangeSet;
