import type {SavedPlan, EditionView, OriginalCollection} from './client.js';
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export interface RequestOptions {signal?: AbortSignal}
export interface InstallationUseRef {installationId:string;revision:number;installationSha256:string;entryId:string}
export interface CalendarSourceIdentity {caseId:string;caseVersion:number;mode:string;planId:string;planContentSha256:string}
export interface SavedUse {
  id:string;date:string;taskId:string;buyerDeploymentId:string;
  mode:'PURCHASE'|'ALLOWANCE_USE'|'REOPEN'|'FREE_USE';state:'PLANNED'|'CANCELLED';
  fundingIds:string[];sourcePeriod:string;sourceIds:string[];note:string;
  [key:string]:Json;
}
export interface CalendarMetadata {schema:string;sha256:string;bytes:number;name:string;case:CalendarSourceIdentity;
  asOfDate:string;importedAt:string;installations:Array<{id:string;revision:number;sha256:string}>}
export interface CalendarSource {
  schema:'stellar-forge.sf47-customer-use-calendar.v1.selection';source:CalendarSourceIdentity;asOfDate:string;
  selection:Array<{id:string;revision:number;sha256:string}>;
  calendars:Array<{id:string;revision:number;sha256:string;name:string;document:{entries:SavedUse[];[key:string]:Json};
    report:Json;currentChanges:Json;sourceChanged:boolean;[key:string]:unknown}>;
  groups:Json[];dueUses:Json[];receipts:Json[];receiptConflicts:Json[];unlinkedPurchases:Json[];sources:Json[];
  qualification:string;
}
export interface PeriodSelection {collectionId:string;name:string;planId:string;planSha256:string;values:Record<string,string>}
export interface RequestRef {collectionId:string;requestKey:string}
export interface ResponseRef {collectionId:string;manifestSha256:string;intentId:string;responseSha256:string}
export interface UseBinding {id:string;entry:InstallationUseRef;kind:'PERIOD_REQUESTS'|'RETAINED_RESPONSES';
  requests:RequestRef[];responses:ResponseRef[];note:string}
export interface CommissionDocument {schema:'stellar-forge.sf88.customer-use-commission.v1';id:string;name:string;
  calendarSha256:string;note:string;periods:PeriodSelection[];bindings:UseBinding[]}
export interface RevisionSummary {id:string;revision:number;sha256:string;parentSha256:string|null;
  createdAt:string;actor:string;documentSha256:string;calendarSha256:string;name:string}
export interface SavedRevision extends RevisionSummary {schema:string;requestId:string;reused:boolean;currentHead:RevisionSummary;executionStarted:false}
export interface OriginalReadError {code:string;message:string}
export interface PeriodState {selection:PeriodSelection;native:EditionView|null;error:OriginalReadError|null}
export interface ResponseState {bindingId:string;selection:ResponseRef;collectionId?:string;item?:Json;nativeFile?:Json;error:OriginalReadError|null}
export interface ReturnSummary {requestId:string;revisionSha256:string;bindingIds:string[];
  state:'RETURNED'|'RECONCILE_ORIGINAL';file?:{name:string;bytes:number;sha256:string};capturedAt?:string;
  counts?:{jobs:number;knownSignedAttempts:number;settled:number;verifiedRetainedOutputs:number;pendingOrUnknown:number}}
export interface CommissionView {
  schema:string;directory:string;queueRoot:string;selected:RevisionSummary;currentHead:RevisionSummary;
  history:RevisionSummary[];document:CommissionDocument;calendar:{metadata:CalendarMetadata;source:CalendarSource};
  plans:Record<string,SavedPlan>;review:Json;periods:PeriodState[];responses:ResponseState[];
  observations:Json;returns:ReturnSummary[];executionStarted:false;
}
export interface SaveInput {document:CommissionDocument;expectedHeadSha256:string|null;actor:string;requestId:string}
export interface PeriodInput {id:string;sha256:string;collectionId:string;actor:string;requestId:string}
export interface CreateInput extends PeriodInput {expectedEditionSha256:string;expectedPreviewSha256:string}
export interface PeriodResult {schema:string;requestId:string;commission:{id:string;sha256:string};
  selection:Json;native:EditionView;current?:EditionView;executionStarted:false}
export interface CaptureInput {id:string;sha256:string;bindingIds:string[];maxVerifyBytes?:number;actor:string;requestId:string}
export interface CapturedRequest {collectionId:string;manifestSha256:string;requestKey:string|null;intentId:string;
  jobId:string;configSha256:string;sourceConfigSha256:string;responseSha256:string|null}
export interface CustomerUseReturnContext {
  source:CalendarSourceIdentity&{calendarSha256:string};
  commission:{id:string;revision:number;revisionSha256:string;documentSha256:string};
  bindings:Array<{id:string;entry:InstallationUseRef;kind:UseBinding['kind'];use:SavedUse;requests:CapturedRequest[]}>;
}
export interface BuyerReturnReport {
  schema:'stellar-forge.sf88.customer-use-return.v1';
  source:{sha256:string;bytes:number;captureStartedAt:string;capturedAt:string;inboxSha256:string;inboxCreatedAt:string};
  buyerSource:{schema:'stellar-forge.sf88.operations-handoff.v1';filename:string;sha256:string;bytes:number;
    captureStartedAt:string;capturedAt:string;inboxSha256:string;inboxCreatedAt:string};
  customerUse:CustomerUseReturnContext;rows:Json[];counts:NonNullable<ReturnSummary['counts']>;reader:Json;interpretation:string;
}
export interface CaptureResult {schema:string;requestId:string;commission:{id:string;sha256:string};
  file:{name:string;bytes:number;sha256:string};original:{bytes:number;sha256:string};
  report:BuyerReturnReport;executionStarted:false;receiving:string}
export interface ActionView {schema:string;id:string;requestId:string;checkedAt?:string;
  request:{schema:string;kind:'SAVE'|'PREPARE_PERIOD'|'CREATE_PERIOD'|'CAPTURE_BUYER_RETURN';
    requestId:string;inputSha256:string;input:Json;preparedAt:string;[key:string]:unknown}|null;
  result:SavedRevision|PeriodResult|CaptureResult|null;state:'RETURNED'|'RECONCILE_ORIGINAL'|'NOT_ADMITTED';executionStarted:false}
export interface ReceivedExport {bytes:Uint8Array;sha256:string;revisionSha256:string;type:string}
export interface ReceivingResult {schema:string;directory:string;queueRoot:string;commissions:Array<{
  id:string;currentHead:RevisionSummary;revisions:number;source:CalendarMetadata;returns:ReturnSummary[];
  periods:Array<{collectionId:string;nativePhase:EditionView['phase']|null;error:OriginalReadError|null}>;
  responses:Array<{bindingId:string;selection:ResponseRef;error:OriginalReadError|null}>;
}>;executionStarted:false;preserved:string}
export interface CustomerUseClient {
  readonly origin:string;
  importSource(input:{bytes:Uint8Array;name?:string;expectedSha256?:string},options?:RequestOptions):
    Promise<{metadata:CalendarMetadata;source:CalendarSource;catalogue:Json[];executionStarted:false}>;
  listSources(options?:RequestOptions):Promise<{schema:string;directory:string;sources:CalendarMetadata[]}>;
  source(input:{sha256:string},options?:RequestOptions):Promise<{metadata:CalendarMetadata;source:CalendarSource;catalogue:Json[]}>;
  list(options?:RequestOptions):Promise<{schema:string;directory:string;queueRoot:string;commissions:Array<RevisionSummary&{revisions:number}>}>;
  inspect(input:{id:string;sha256?:string},options?:RequestOptions):Promise<CommissionView>;
  save(input:SaveInput,options?:RequestOptions):Promise<SavedRevision>;
  prepare(input:PeriodInput,options?:RequestOptions):Promise<PeriodResult>;
  create(input:CreateInput,options?:RequestOptions):Promise<PeriodResult>;
  capture(input:CaptureInput,options?:RequestOptions):Promise<CaptureResult>;
  action(input:{id:string;requestId:string},options?:RequestOptions):Promise<ActionView>;
  export(input:{id:string;sha256:string;format?:'json'|'csv'},options?:RequestOptions):Promise<ReceivedExport>;
  returnedFile(input:{id:string;requestId:string},options?:RequestOptions):Promise<ReceivedExport>;
  verifyReceiving(options?:RequestOptions):Promise<ReceivingResult>;
}
export declare function createCustomerUseClient(options:{url:string;fetch?:typeof globalThis.fetch}):CustomerUseClient;
