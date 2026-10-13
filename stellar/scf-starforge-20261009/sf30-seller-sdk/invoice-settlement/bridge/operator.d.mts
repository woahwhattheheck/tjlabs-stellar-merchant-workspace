import type {OriginalEndpointBinding as BridgeBinding} from './bridge-provider.mjs';
export interface Descriptor {path:string;bytes:number;sha256:string}
export interface BridgeSelection {
  provider:'bridge';id:string;transportId:string;environment:'sandbox'|'production';
  network:string;origin:string;basePathSha256:string;tenantName:null;walletId:null;
  binding:BridgeBinding;kinds:Array<'transfers'|'transfer'|'virtualAccountActivities'>;mutations:[];
}
export interface BridgePrivateConfiguration {
  baseUrl:string;network:string;environment:'sandbox'|'production';binding:BridgeBinding;
  apiKey?:string;headers?:Record<string,string>;allowHttp?:boolean;
  timeoutMs?:number;maximumResponseBytes?:number;
}
export type BridgeRead =
  | {kind:'transfers';limit?:number;starting_after?:string|null;filters?:{
      tx_hash?:string;updated_after_ms?:number;updated_before_ms?:number;template_id?:string;state?:string}}
  | {kind:'transfer';id:string;filters?:Record<string,never>}
  | {kind:'virtualAccountActivities';customerId:string;virtualAccountId:string;limit?:number;starting_after?:string|null;
      filters?:{deposit_id?:string;deposit_ids?:string[];tx_hash?:string;event_type?:string}};
export interface OriginalMutation {requestId:string;expectedRevision:number}
export interface OriginalProgramme {programmeId?:string;programmeVersion?:number}
export interface CaptureCreate extends OriginalMutation,OriginalProgramme {
  name:string;actor:string;note:string;read:BridgeRead;maxPages?:number;
}
export interface CaptureNext extends OriginalMutation {captureId:string;resumeFailure?:boolean}
export interface WebhookReceive extends OriginalMutation,OriginalProgramme {
  endpointId:string;receivedAtMs:number;rawBodyBase64:string;signatureHeader:string;publicKeyPem:string;
  maxAgeMs?:number;maxFutureSkewMs?:number;
}
export interface EditionSelection {sourceIds:string[];name:string;asOfDate:string;note:string;pendingHours?:number}
export interface EditionSave extends OriginalMutation,EditionSelection {expectedPreviewSha256:string}
export interface IncidentDecision extends OriginalMutation {
  editionId:string;incidentId:string;action:'ACKNOWLEDGE'|'INVESTIGATE'|'EXTERNAL_RESOLUTION_RECORDED';
  actor:string;at:string;note:string;reference?:string|null;
}
export interface BridgeMethod {method:string;mutates:boolean;required:readonly string[]}
export interface BridgeOperator {
  invoke(input:{method:string;args?:Record<string,unknown>}):Promise<unknown>;
  methods():BridgeMethod[];describe():Promise<unknown>;close():Promise<{state:'CLOSED'}>;
  inspect():{closing:boolean;closed:{source:boolean;bridge:boolean;original:boolean};active:number};
  publicError(error:unknown):unknown;
}
export interface BridgeOperatorOptions {
  workspaceDirectory:string;expectedWorkspaceId?:string;applicationDirectory?:string;
  connections?:Record<string,unknown>;profile?:Record<string,unknown>;signal?:AbortSignal;
  bridgeConfiguration?:BridgePrivateConfiguration;retainedSelection?:BridgeSelection;
}
export function openBridgeOperator(input:BridgeOperatorOptions):Promise<BridgeOperator>;
export interface BridgeReceivingInput {
  schema:'stellar-forge.invoice-settlement.bridge-receiving.v1.input';
  operationId:string;workspaceId:string;expectedRevision:number;selection:BridgeSelection;
  sourceWorkspace:string;outputDirectory:string;exportDirectory:string;receivedDirectory:string;reexportDirectory:string;
  exportRequestId:string;receiveRequestId:string;reexportRequestId:string;
}
export interface BridgeReceivingResult {
  schema:'stellar-forge.invoice-settlement.bridge-receiving.v1.result';status:'COMPLETED';
  input:BridgeReceivingInput;inputSha256:string;workspaceId:string;selection:BridgeSelection;
  exported:Record<string,unknown>;received:Record<string,unknown>;reexported:Record<string,unknown>;
  verified:{workspaceId:string;sourceIds:string[];sources:number;requests:number;providerRequests:0;ledgerMutations:0};
  files:Descriptor[];closed:{producingOperator:true;receivedOperator:true};providerRequests:0;ledgerMutations:0;
}
