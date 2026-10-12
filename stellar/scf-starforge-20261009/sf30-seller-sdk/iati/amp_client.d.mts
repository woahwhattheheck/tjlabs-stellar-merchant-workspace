/** MIT. Complete AMP commissioning types on the existing IATI client. */
import type {Sha256, JsonValue, RequestOptions, RevisionOptions, PacketInput} from './client.mjs';
export type NativeJson = string;
export type AmpFileKind = 'analysis'|'sourceRows'|'comparison'|'prepared'|'report';
export type AmpDecisionState = 'included'|'excluded'|'review';
export interface AmpConnection {baseUrl:string;workspaceId:number;installedVersion:string;expectedUserId?:number;label?:string}
export interface AmpCoverage {kind:'explicit-projects'|'native-export';projectIds:number[];note:string}
export interface AmpCaptureInput {connection:AmpConnection;coverage:AmpCoverage;fieldsJson:NativeJson;valuesJson:NativeJson;projectsJson:NativeJson;sessionJson?:NativeJson;layoutJson?:NativeJson;name?:string;acquisition:string;exchanges?:JsonValue[]}
export interface AmpCapture extends AmpCaptureInput {destinationAnalysis:JsonValue;id:Sha256;schema:'stellar-forge.amp-native-capture.v1';createdAt:string;actor:string}
export interface AmpCaptureSummary {id:Sha256;name:string;createdAt:string;connection:AmpConnection;coverage:AmpCoverage}
export interface AmpFile {sha256:Sha256;name:string;media:string;bytes:number}
export interface AmpSelection {id:Sha256;revision:number}
export interface AmpActivityLink {publisherRef:string;activityId:string;note:string;projectId?:number;draftId?:string}
export interface AmpCurrencyLink {code:string;nativeId:number;note:string}
export interface AmpMeasureLink {sourceType:'2'|'3'|'4';family:'commitments'|'disbursements'|'expenditures';adjustmentId:number;meaning:'actual';note:string}
export interface AmpDecision {action:'include'|'exclude'|'review';sourceRowSha256:Sha256;note:string;fundingId?:number;donorId?:number;transactionId?:number;fundingJson?:NativeJson;transactionJson?:NativeJson;dateChoice?:'transaction-date'|'value-date'}
export interface AmpCorrespondence {before:Sha256;after:Sha256;note:string}
export interface AmpDefinition {name:string;notes:string;portfolio:AmpSelection;captureId:Sha256;activityLinks:AmpActivityLink[];currencyLinks:AmpCurrencyLink[];measureLinks:AmpMeasureLink[];decisions:Record<Sha256,AmpDecision>;projectDrafts?:Record<string,NativeJson>;previousPlan?:AmpSelection;correspondence?:AmpCorrespondence[]}
export interface AmpPlan {schema:'stellar-forge.iati-amp-plan.v1';id:Sha256;revision:number;previousRevision:number|null;createdAt:string;updatedAt:string;actor:string;state:'review'|'reviewed'|'changes'|'prepared';definition:AmpDefinition;sourceRows:AmpFile;analysis:AmpFile;comparison:AmpFile|null;counts:Partial<Record<AmpDecisionState,number>>;review:{actor:string;decision:'approve'|'changes';note:string;analysisSha256:Sha256;at:string}|null;prepared:AmpFile|null;report:AmpFile;recordSha256:Sha256}
export interface AmpPlanSummary {id:Sha256;revision:number;name:string;state:AmpPlan['state'];updatedAt:string;counts:AmpPlan['counts'];portfolio:AmpSelection;captureId:Sha256}
export interface AmpRow {key:Sha256;source:Sha256;collection:'transactions'|'budgets';sourceRowSha256:Sha256;publisherRef:string;activityId:string;rowId:string;identityBasis:string;dimensions:Record<string,string>;sourceRow:Record<string,string>;state:AmpDecisionState;issues:string[];decision:AmpDecision|null;proposal:JsonValue|null}
export interface AmpFinancialGroup {dimensions:Record<string,string>;count:number;amount:string}
export interface AmpRows {id:Sha256;revision:number;analysisSha256:Sha256;offset:number;limit:number;total:number;rows:AmpRow[];nextOffset:number|null;counts:AmpPlan['counts'];financialGroups:AmpFinancialGroup[];ready:boolean;destinationReview:JsonValue[]}
export interface AmpScope {all?:boolean;undecidedOnly?:boolean;publisherRefs?:string[];activityIds?:string[];collections?:('transactions'|'budgets')[];currencies?:string[];transactionTypes?:string[];keys?:Sha256[]}
export interface AmpScopePreview {id:Sha256;revision:number;selection:AmpScope;selectedSha256:Sha256;count:number;groups:{dimensions:Record<string,string>;count:number}[];rows:{key:Sha256;sourceRowSha256:Sha256}[]}
export interface AmpRequest {requestId:string;found:boolean;action:string|null;result:JsonValue|null}
export interface AmpAction {requestId:string;actor:string}
export interface AmpSave extends AmpAction {id?:Sha256;expectedRevision?:number;definition:AmpDefinition}
export interface AmpSaved {id:Sha256;revision:number;state:AmpPlan['state'];counts?:AmpPlan['counts'];projectCount?:number;prepared?:AmpFile;reused?:boolean}
export interface AmpReview extends AmpAction {id:Sha256;expectedRevision:number;analysisSha256:Sha256;decision:'approve'|'changes';note:string}
export interface AmpPrepare extends AmpAction {id:Sha256;expectedRevision:number}
export interface AmpDecisions extends AmpPrepare {selection:AmpScope;selectedSha256:Sha256;decision:Omit<AmpDecision,'sourceRowSha256'>}
export interface AmpAdvance extends AmpAction {id:Sha256;revision:number;portfolio:AmpSelection;captureId:Sha256;name:string;notes:string;correspondence?:AmpCorrespondence[]}
/** Credentials belong to one existing installed session and are omitted from retained requests. */
export interface AmpCredentials {username:string;passwordSha1:string}
export interface AmpNativeCapture extends AmpAction {connection:AmpConnection;projectIds:number[];coverageNote:string;name:string;credentials:AmpCredentials}
export interface AmpCaptureResult {destinationAnalysis:JsonValue;captureId:Sha256;connection:AmpConnection;coverage:AmpCoverage}
export interface AmpNativeStart extends AmpPrepare {preparedSha256:Sha256;credentials:AmpCredentials}
export interface AmpNativeReconcile extends AmpAction {runId:Sha256;stepKey:string;nativeId:number;note:string;credentials:AmpCredentials}
export interface AmpRunSummary {id:Sha256;plan:Sha256;revision:number;state:string;startedAt:string;updatedAt:string;projectCount:number}
export interface AmpNativeStep {key:string;mode:'create'|'update';originalId:number|null;iatiIdentifier:string|null;preimageSha256:Sha256|null;preimageJson:NativeJson|null;requestJson:NativeJson;requestSha256:Sha256;changes:JsonValue[];destinationValidation:JsonValue;configurationCaptureId?:Sha256;configurationReview?:AmpFile;state:string;afterId?:number;actual?:AmpFile;result?:AmpFile}
export interface AmpRun extends AmpRunSummary {schema:'stellar-forge.iati-amp-native-run.v1';actor:string;captureId:Sha256;connection:AmpConnection;preparedSha256:Sha256;steps:AmpNativeStep[];linkedPreparations?:{plan:Sha256;revision:number;preparedSha256:Sha256}[]}
export interface AmpNativeStarted {runId:Sha256;state:string;reused?:boolean;started?:boolean}
export interface AmpNativeReceived {runId:Sha256;stepKey:string;state:string;result?:AmpFile}
export interface AmpEvents {runId:Sha256;events:({sequence:number;originalSequence:number;at:string;stage:string}&Record<string,JsonValue>)[];nextAfter:number|null}
export interface AmpStatus {schema:'stellar-forge.iati-amp-status.v1';captures:AmpCaptureSummary[];plans:AmpPlanSummary[];runs:AmpRunSummary[];contract:string}
export interface AmpReceiving {schema:string;selection:AmpSelection;plans:number;captures:number;nativeRuns:number;originalAssets:number;state:AmpPlan['state']}
