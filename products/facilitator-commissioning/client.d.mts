// SPDX-License-Identifier: MIT
export type Json = null | boolean | number | string | Json[] | {[key:string]:Json};
export interface FileRef {sha256:string;bytes:number}
export interface Upload extends FileRef {id:string;name:string;state:'UPLOADING'|'COMPLETE';offset:number;file?:FileRef}
export interface SourceRequest {id:string;routeId:string;url:string;method:string;body?:FileRef;output:FileRef;mediaType:string}
export interface ProviderSelection {alias:string;releaseId:string;operatorId:string;operatorName:string;authorityReference:string;authority:FileRef;supportedResponse?:FileRef}
export interface ServiceSelection {id:string;title:string;releaseId:string;providers:ProviderSelection[];requests:SourceRequest[];service:{purpose:string;sourceReference:string;sourceEdition:string;receiver:{name:string;system:string;operator:string};scope:FileRef;schema:FileRef;acceptance:FileRef}}
export interface ActionPayloads {
  initialize:ServiceSelection;
  review:{provider:string;review?:FileRef};
  stage:{reviewOperationId:string};
  select:{provider:string;expectedGeneration:number;reason:string};
  start:{provider:string;expectedGeneration:number};
  stop:{runOperationId:string};
  'receive-run':{runOperationId:string;nativeInstanceId:string};
  'buyer-plan':{provider:string;template:string;requests:Array<{requestId:string;intentId:string;paymentOption:number}>};
  receive:{provider:string;requestId:string;runOperationId:string;summary:FileRef;evidence:FileRef;output?:FileRef;receiving:{operator:string;decision:'ACCEPTED'|'CHANGES_REQUIRED'|'INCOMPLETE';note:string;receivedAt:string};supersedesOperationId?:string};
  'installation-template':{sourceTransferId:string;seed:FileRef;caseSnapshot:FileRef};
  'installation-prepare':{templateOperationId:string;bindings:FileRef};
  'installation-preview':{hostAlias:string;preparationOperationId:string;actor:string;note:string;receivingName:string};
  'installation-save':{receivingOperationId:string;expectedSnapshotSha256:string};
  'installation-export':{receivingOperationId:string;expectedSnapshotSha256:string};
  'installation-receive':{receivingOperationId:string;expectedSnapshotSha256:string};
  export:Record<string,never>;
}
export type Action=keyof ActionPayloads;
export type Command<A extends Action=Action> = A extends Action ? {operationId:string;expectedRevision:number;action:A;payload:ActionPayloads[A]} : never;
export interface Receipt {schema:string;operationId:string;action:Action;completedAt:string;result:Json;replayed?:boolean}
export interface Receiving {state:'COMPLETE'|'NOT_FOUND'|'PENDING'|'RECONCILIATION_REQUIRED';operationId?:string;request?:Command;receipt?:Receipt;nativeResultPresent?:boolean;message?:string;runs?:Json[]}
export interface HistoryPage {items:Json[];offset:number;limit:number;total:number;next_offset:number|null;revision:number;jobId:string}
export interface OperatorState {schema:string;instanceId:string;job:null|({id:string;title:string;revision:number;providers:Json[];requests:Json[];service:Json;originalSelection:Json}&Record<string,unknown>);report:Json;counts:null|{results:number;runs:number;pending:number};activeRun:null|{operationId:string;provider:string;started:Json};nativeRuntime:Json;setup:{configured:boolean;profiles:Array<{alias:string;label:string;url:string}>;buyerTemplates:Array<{alias:string;title:string}>;sourceSha256?:string};uploads:Upload[];pendingRequests:Array<{operationId:string;action:Action;expectedRevision:number}>;transfers:Array<{id:string;jobId:string;files:number;originalManifestSha256:string}>}
export interface InstallationSummary {operationId:string;mode:'template'|'prepare';jobId:string;selectionSha256:string;sourceTransferId:string;basis:Json;nativeReceipt:FileRef;files:number;selections:Array<{field:string;purpose:string}>;missingSourceCount:number;completedAt:string}
export interface InstallationCatalog {schema:string;jobId:string;selectionSha256:string;revision:number;preparations:InstallationSummary[];sources:Array<{operationId:string;completedAt:string;sourceMembers:number;manifestSha256:string}>}
export interface InstallationView {schema:string;preparation:InstallationSummary;bindings?:Json;defaults?:Json;workshare?:Json;workorder?:Json;assignments?:Json;checks?:Json;continuation?:Json;prepared?:Json;items?:Json[];offset?:number;limit?:number;total?:number;next_offset?:number|null}
export interface NativeInstallationSummary {receivingOperationId:string;preparationOperationId:string;hostAlias:string;state:string;basis:Json;observedAt:string|null;snapshotSha256?:string;errorCount?:number;outerOperationId?:string;action?:Action;responses?:Record<string,{validated:boolean;bytes:number;sha256:string;mediaType:string}>;completion?:Json}
export interface NativeInstallationCatalog {schema:string;jobId:string;selectionSha256:string;hosts:Array<{alias:string;title:string}>;items:NativeInstallationSummary[]}
export interface NativeInstallationView extends NativeInstallationSummary {schema:string;jobId:string;selectionSha256:string;snapshotSha256:string;host?:Json;files?:number;originalCommand?:Command;observedCommand?:Command;file?:{name:string;bytes:number;sha256:string};value?:Json;items?:Array<{name:string;bytes:number;sha256:string;contentType:string}>;offset?:number;limit?:number;total?:number;next_offset?:number|null}
export class CommissioningClient {
  constructor(options?:{origin?:string;token?:string;fetch?:typeof globalThis.fetch});
  request(path:string,options?:{method?:string;body?:unknown;raw?:boolean}):Promise<unknown>;
  authenticate(token:string):Promise<{authenticated:true}>;
  state():Promise<OperatorState>;
  installations():Promise<InstallationCatalog>;
  installation(options:{id:string;kind?:'summary'|'files'|'sources';offset?:number;limit?:number}):Promise<InstallationView>;
  installationArchiveURL(operationId:string):string;
  installationReceivings():Promise<NativeInstallationCatalog>;
  installationReceiving(options:{id:string;kind?:'summary'|'files'|'preview'|'saved'|'received'|'operation';offset?:number;limit?:number;snapshotSha256?:string}):Promise<NativeInstallationView>;
  release(id:string):Promise<Json>;
  history(options?:{kind?:'results'|'runs'|'pending';offset?:number;limit?:number;revision?:number}):Promise<HistoryPage>;
  prepare(command:Command):Promise<{request:Command;replayed:boolean}>;
  apply(command:Command):Promise<Receipt>;
  receive(operationId:string):Promise<Receiving>;
  beginUpload(input:{id:string;name:string;bytes:number;sha256:string}):Promise<Upload>;
  uploadState(id:string):Promise<Upload>;
  uploadChunk(id:string,offset:number,body:ArrayBuffer|Uint8Array):Promise<Upload>;
  completeUpload(id:string):Promise<Upload>;
  fileURL(options:{kind:'input'|'blob'|'buyer'|'buyer-execution'|'command'|'report'|'transfer'|'installation'|'installation-native';id?:string;name?:string;snapshotSha256?:string}):string;
  archiveURL(operationId:string):string;
}
