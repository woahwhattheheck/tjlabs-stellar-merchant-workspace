/** Complete defect-support contracts over the original portfolio console. */
import {GrantPortfolioClient, type RequestOptions, type ActionOptions, type RetainedRequest} from './client.mjs';

export const DEFECT_SUPPORT_SCHEMA:'tjlabs.pmrs.defect-support/v1';
export const DEFECT_SUPPORT_ACTIONS:readonly SupportAction[];
export type SupportId=string;
export type SupportSha256=string;
export type SupportTimestamp=string;
export type SupportSeverity='critical'|'other';
export type SupportState='received'|'triaged'|'acknowledged'|'planned'|'in-correction'|'ready-for-review'|'closed';
export type SupportClassification='investigating'|'delivered-defect'|'new-functionality'|'material-enhancement'|
  'new-integration'|'changed-requirement'|'third-party-change'|'not-reproduced';
export interface SupportSourceReference {
  kind:string; label:string; verification:string; uri?:string; sha256?:SupportSha256;
  sourceId?:string; entityKey?:string; editionId?:string; row?:number; note?:string; object?:SupportSha256;
}
export interface SupportPortfolio {id:string;revision:number;snapshot:SupportSha256;}
export interface SupportReleaseReference {recordId:string;recordSha256:SupportSha256;}
export interface SupportCorrectionReference {
  correctionId:string;operationId:string;projectRecordId:string;stateVersion:number;historySha256:SupportSha256;
}
export interface SupportProjectReference {
  projectRecordId:string;nativeOperationId?:string;stateVersion?:number;sourceRefs:SupportSourceReference[];
}
export interface SupportCalendarFields {
  name:string;timeZone:string;weekdays:number[];holidays:string[];opens:string;closes:string;
  counting:'working-time'|'next-business-day-close';sourceRefs:SupportSourceReference[];
}
export type SupportCalendar=SupportCalendarFields&(
  {state:'proposed';agreedAt?:null}|{state:'agreed';agreedAt:SupportTimestamp});
export interface SupportRecordIdentity {
  id:SupportId;revision:number;sha256:SupportSha256;previousSha256:SupportSha256|null;
  originWorkspaceId:string;operationId:string;inputSha256:SupportSha256;
  createdAt:SupportTimestamp;updatedAt:SupportTimestamp;actor:string;
}
export interface SupportAcceptance {
  acceptedAt:SupportTimestamp;supportEndsAt:SupportTimestamp;sourceRefs:SupportSourceReference[];
  recordedBy:string;recordedAt:SupportTimestamp;amendmentReason?:string|null;previousAcceptanceRevision?:number|null;
}
export interface SupportContract extends SupportRecordIdentity {
  schema:'tjlabs.pmrs.defect-support/v1.contract';portfolio:SupportPortfolio;label:string;
  serviceOwner:string;componentOwners:Record<string,string>;calendar:SupportCalendar|null;
  plannedAcceptanceOn:string;warrantyMonths:12;acknowledgementBusinessDays:{critical:1;other:2};
  sourceRefs:SupportSourceReference[];acceptance:SupportAcceptance|null;
}
export interface SupportClock {
  state:'calendar-not-selected'|'contractual'|'planning';businessDays:1|2;receivedAt:SupportTimestamp;
  dueAt:SupportTimestamp|null;calendarSha256:SupportSha256|null;calendar:SupportCalendar|null;
}
export interface SupportClockStatus {
  state:string;dueAt:SupportTimestamp|null;acknowledgedAt:SupportTimestamp|null;businessDays:1|2;
  late:boolean|null;asOf:SupportTimestamp;previousContractualDeadlineMissed:boolean;
  earlierDeadlines:{dueAt:SupportTimestamp;reviewedAt:SupportTimestamp;state:string;lateAtReview:boolean}[];
}
export interface SupportEntitlement {
  state:'acceptance-not-recorded'|'before-acceptance'|'within-term'|'after-term';
  covered:boolean|null;acceptance:SupportAcceptance|null;
}
export interface SupportAcknowledgement {
  at:SupportTimestamp;channel:'email'|'portal'|'phone'|'meeting'|'other';message:string;
  sourceRefs:SupportSourceReference[];recordedBy:string;
}
export interface SupportPlan {
  agreedAt:SupportTimestamp;agreement:string;sourceRefs:SupportSourceReference[];
  workaroundDueAt:SupportTimestamp|null;correctionDueAt:SupportTimestamp|null;
}
export interface SupportCycle {
  number:number;receivedAt:SupportTimestamp;reproduction:string;sourceRefs:SupportSourceReference[];
  contractRevision:number;acknowledgementClock:SupportClock;
  clockReviews:{at:SupportTimestamp;reason:string;sourceRefs:SupportSourceReference[];before:SupportClock;after:SupportClock}[];
  acknowledgement:SupportAcknowledgement|null;plan:SupportPlan|null;
  workarounds:{at:SupportTimestamp;description:string;sourceRefs:SupportSourceReference[];actor:string}[];
  correction:{reference:SupportCorrectionReference;linkedAt:SupportTimestamp;sourceRefs:SupportSourceReference[];resolvedStatus:string|null}|null;
  validation:{installation:SupportReleaseReference;correction:SupportCorrectionReference;testedAt:SupportTimestamp;
    outcome:'passed'|'failed';verification:string;sourceRefs:SupportSourceReference[];actor:string}|null;
  closure:{at:SupportTimestamp;outcome:'corrected'|'reviewed-no-change'|'separately-scoped'|'duplicate';reason:string;
    sourceRefs:SupportSourceReference[];actor:string;duplicateOf?:{id:string;revision:number;sha256:SupportSha256}}|null;
}
export interface SupportIssue extends SupportRecordIdentity {
  schema:'tjlabs.pmrs.defect-support/v1.issue';contractId:string;title:string;description:string;reporter:string;
  severity:SupportSeverity;classification:SupportClassification;component:string;owner:string;state:SupportState;
  sourceRefs:SupportSourceReference[];notes:{at:SupportTimestamp;actor:string;text:string;sourceRefs:SupportSourceReference[]}[];
  affectedRelease:SupportReleaseReference|null;project:SupportProjectReference|null;entitlement:SupportEntitlement;cycles:SupportCycle[];
}
export interface SupportActor {actor:string;}
export interface SaveSupportContractInput extends SupportActor {
  id:string;expectedContractRevision:number;portfolio:SupportPortfolio;label:string;serviceOwner:string;
  componentOwners:Record<string,string>;calendar:SupportCalendar|null;plannedAcceptanceOn:string;sourceRefs:SupportSourceReference[];
}
export interface RecordSupportAcceptanceInput extends SupportActor {
  id:string;expectedContractRevision:number;acceptedAt:SupportTimestamp;supportEndsAt?:SupportTimestamp;
  sourceRefs:SupportSourceReference[];amendmentReason?:string;
}
export interface OpenSupportIssueInput extends SupportActor {
  id:string;contractId:string;expectedContractRevision:number;title:string;description:string;receivedAt:SupportTimestamp;
  severity:SupportSeverity;reproduction:string;component?:string;reporter?:string;
  affectedRelease?:SupportReleaseReference|null;project?:SupportProjectReference|null;sourceRefs:SupportSourceReference[];
}
export interface SupportIssueInput extends SupportActor {id:string;expectedIssueRevision:number;}
export interface TriageSupportIssueInput extends SupportIssueInput {
  severity:SupportSeverity;classification:SupportClassification;component:string;owner:string;reason:string;
  reproduction?:string;affectedRelease?:SupportReleaseReference|null;project?:SupportProjectReference|null;sourceRefs:SupportSourceReference[];
}
export interface AcknowledgeSupportIssueInput extends SupportIssueInput {
  at:SupportTimestamp;channel:SupportAcknowledgement['channel'];message:string;sourceRefs:SupportSourceReference[];
}
export interface PlanSupportIssueInput extends SupportIssueInput {
  agreedAt:SupportTimestamp;agreement:string;workaroundDueAt?:SupportTimestamp|null;correctionDueAt?:SupportTimestamp|null;
  sourceRefs:SupportSourceReference[];
}
export interface RecordSupportWorkaroundInput extends SupportIssueInput {at:SupportTimestamp;description:string;sourceRefs:SupportSourceReference[];}
export interface LinkSupportCorrectionInput extends SupportIssueInput {correction:SupportCorrectionReference;sourceRefs:SupportSourceReference[];}
export interface ValidateSupportCorrectionInput extends SupportIssueInput {
  installation:SupportReleaseReference;testedAt:SupportTimestamp;outcome:'passed'|'failed';verification:string;sourceRefs:SupportSourceReference[];
}
export interface CloseSupportIssueInput extends SupportIssueInput {
  at:SupportTimestamp;outcome:'corrected'|'reviewed-no-change'|'separately-scoped'|'duplicate';
  reason:string;sourceRefs:SupportSourceReference[];duplicateOf?:string;
}
export interface ReopenSupportIssueInput extends SupportIssueInput {
  receivedAt:SupportTimestamp;reason:string;reproduction:string;severity:SupportSeverity;sourceRefs:SupportSourceReference[];
}
export interface NoteSupportIssueInput extends SupportIssueInput {text:string;sourceRefs:SupportSourceReference[];}
export interface ReviewSupportClockInput extends SupportIssueInput {expectedContractRevision:number;reason:string;sourceRefs:SupportSourceReference[];}
export interface PrepareSupportDeliveryInput extends SupportActor {
  contractId:string;expectedContractRevision:number;delivery:SupportReleaseReference;
}
export interface ReceiveSupportDeliveryInput extends SupportActor {object:SupportSha256;}
export interface SupportPayloadMap {
  'support.contract.save':SaveSupportContractInput;
  'support.contract.acceptance':RecordSupportAcceptanceInput;
  'support.issue.open':OpenSupportIssueInput;
  'support.issue.triage':TriageSupportIssueInput;
  'support.issue.acknowledge':AcknowledgeSupportIssueInput;
  'support.issue.plan':PlanSupportIssueInput;
  'support.issue.workaround':RecordSupportWorkaroundInput;
  'support.issue.correction':LinkSupportCorrectionInput;
  'support.issue.validate':ValidateSupportCorrectionInput;
  'support.issue.close':CloseSupportIssueInput;
  'support.issue.reopen':ReopenSupportIssueInput;
  'support.issue.note':NoteSupportIssueInput;
  'support.issue.clock-review':ReviewSupportClockInput;
  'support.delivery.prepare':PrepareSupportDeliveryInput;
  'support.delivery.receive':ReceiveSupportDeliveryInput;
}
export type SupportAction=keyof SupportPayloadMap;
export type SupportActionInput={
  [A in SupportAction]:{operationId:string;action:A;payload:SupportPayloadMap[A];expectedRevision?:number}
}[SupportAction];
export interface SupportRecordResult<T extends SupportContract|SupportIssue=SupportContract|SupportIssue> {
  schema:'tjlabs.pmrs.defect-support/v1.result';kind:'contract'|'issue';id:string;revision:number;sha256:SupportSha256;record:T;
}
export interface SupportDelivery {
  schema:string;object:SupportSha256;bytes:number;filename:string;manifestSha256:SupportSha256;
  contract:{id:string;revision:number;sha256:SupportSha256};portfolio:SupportPortfolio;
  operationId:string;inputSha256:SupportSha256;counts:{contracts:number;issues:number;events:number;requests:number};
  nativeDelivery?:{recordId:string;recordSha256:SupportSha256;file:string;sha256:SupportSha256;bytes:number;manifestSha256:string};
  sourceWorkspaceId?:string;workspaceId?:string;providerRequestsReplayed?:0;editableSupport?:true;nativeReceiving?:unknown;
}
export type SupportResult=SupportRecordResult|SupportDelivery;
export type SupportMethod<P,R=SupportResult>=(operationId:string,payload:P,options?:ActionOptions)=>Promise<RetainedRequest<R>>;
export interface SupportBoardQuery {contractId?:string;state?:SupportState;search?:string;offset?:number;limit?:number;asOf?:SupportTimestamp;}
export interface SupportBoardRow {
  id:string;revision:number;contractId:string;title:string;state:SupportState;severity:SupportSeverity;
  classification:SupportClassification;component:string;owner:string;receivedAt:SupportTimestamp;updatedAt:SupportTimestamp;
  cycle:number;clock:SupportClockStatus;correctionDueAt:SupportTimestamp|null;affectedRelease:SupportReleaseReference|null;entitlement:SupportEntitlement;
  recordedEntitlement:SupportEntitlement;entitlementContract:{id:SupportId;revision:number;sha256:SupportSha256}|null;
}
export interface SupportPage<T> {rows:T[];total:number;offset:number;nextOffset:number|null;}
export interface SupportBoard extends SupportPage<SupportBoardRow> {
  schema:'tjlabs.pmrs.defect-support/v1.state';workspaceId:string;revision:number;contracts:SupportContract[];asOf:SupportTimestamp;
  summary:{total:number;open:number;critical:number;awaitingAcknowledgement:number};
}
export interface SupportHistoryQuery {kind:'contract'|'issue';id:string;offset?:number;limit?:number;}
export interface SupportEvent {
  schema:'tjlabs.pmrs.defect-support/v1.event';originWorkspaceId:string;operationId:string;inputSha256:SupportSha256;
  action:SupportAction;actor:string;at:SupportTimestamp;kind:'contract'|'issue';entityId:string;revision:number;
  previousSha256:SupportSha256|null;recordSha256:SupportSha256;input:SupportActionInput;
}
export interface SupportHistoryPage extends SupportPage<SupportContract|SupportIssue> {events:SupportEvent[];}
export interface SupportReleaseOption extends SupportReleaseReference {
  kind:string;createdAt:SupportTimestamp;state:string|null;label:string;version:string|null;portfolio:SupportPortfolio;
}
export interface SupportCorrectionOption {
  reference:SupportCorrectionReference;title:string;status:string;projectLabel?:string;recordedAt?:SupportTimestamp;
}
export interface SupportSelectionPage<T> extends SupportPage<T> {contractId:string;contractRevision:number;}
export interface SupportReleaseQuery {contractId:string;mode?:'affected'|'installation'|'delivery';offset?:number;limit?:number;}
export interface SupportCorrectionQuery {contractId:string;offset?:number;limit?:number;}

export class DefectSupportClient extends GrantPortfolioClient {
  constructor(consoleUrl:string,options?:{timeoutMs?:number});
  supportState(filters?:SupportBoardQuery,options?:RequestOptions):Promise<SupportBoard>;
  supportContract(id:string,options?:RequestOptions&{revision?:number}):Promise<SupportContract>;
  supportIssue(id:string,options?:RequestOptions&{revision?:number}):Promise<SupportIssue>;
  supportHistory(query:SupportHistoryQuery,options?:RequestOptions):Promise<SupportHistoryPage>;
  supportHistoryPages(query:SupportHistoryQuery,options?:RequestOptions):AsyncIterable<SupportHistoryPage>;
  supportReleases(query:SupportReleaseQuery,options?:RequestOptions):Promise<SupportSelectionPage<SupportReleaseOption>&{mode:string}>;
  supportCorrections(query:SupportCorrectionQuery,options?:RequestOptions):Promise<SupportSelectionPage<SupportCorrectionOption>>;
  supportAction<A extends SupportAction>(operationId:string,action:A,payload:SupportPayloadMap[A],options?:ActionOptions):Promise<RetainedRequest<SupportResult>>;
  saveSupportContract:SupportMethod<SaveSupportContractInput,SupportRecordResult<SupportContract>>;
  recordSupportAcceptance:SupportMethod<RecordSupportAcceptanceInput,SupportRecordResult<SupportContract>>;
  openSupportIssue:SupportMethod<OpenSupportIssueInput,SupportRecordResult<SupportIssue>>;
  triageSupportIssue:SupportMethod<TriageSupportIssueInput,SupportRecordResult<SupportIssue>>;
  acknowledgeSupportIssue:SupportMethod<AcknowledgeSupportIssueInput,SupportRecordResult<SupportIssue>>;
  planSupportIssue:SupportMethod<PlanSupportIssueInput,SupportRecordResult<SupportIssue>>;
  recordSupportWorkaround:SupportMethod<RecordSupportWorkaroundInput,SupportRecordResult<SupportIssue>>;
  linkSupportCorrection:SupportMethod<LinkSupportCorrectionInput,SupportRecordResult<SupportIssue>>;
  validateSupportCorrection:SupportMethod<ValidateSupportCorrectionInput,SupportRecordResult<SupportIssue>>;
  closeSupportIssue:SupportMethod<CloseSupportIssueInput,SupportRecordResult<SupportIssue>>;
  reopenSupportIssue:SupportMethod<ReopenSupportIssueInput,SupportRecordResult<SupportIssue>>;
  noteSupportIssue:SupportMethod<NoteSupportIssueInput,SupportRecordResult<SupportIssue>>;
  reviewSupportClock:SupportMethod<ReviewSupportClockInput,SupportRecordResult<SupportIssue>>;
  prepareSupportDelivery:SupportMethod<PrepareSupportDeliveryInput,SupportDelivery>;
  receiveSupportDelivery:SupportMethod<ReceiveSupportDeliveryInput,SupportDelivery>;
  dispose():Promise<void>;
}
export function connectDefectSupport(options:{consoleUrl?:string;consoleUrlFile?:string;timeoutMs?:number}):Promise<DefectSupportClient>;
