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
  export:Record<string,never>;
}
export type Action=keyof ActionPayloads;
export type Command<A extends Action=Action> = A extends Action ? {operationId:string;expectedRevision:number;action:A;payload:ActionPayloads[A]} : never;
export interface Receipt {schema:string;operationId:string;action:Action;completedAt:string;result:Json;replayed?:boolean}
export interface Receiving {state:'COMPLETE'|'NOT_FOUND'|'PENDING'|'RECONCILIATION_REQUIRED';operationId?:string;request?:Command;receipt?:Receipt;nativeResultPresent?:boolean;message?:string;runs?:Json[]}
export interface HistoryPage {items:Json[];offset:number;limit:number;total:number;next_offset:number|null;revision:number;jobId:string}
export interface OperatorState {schema:string;instanceId:string;job:null|({id:string;title:string;revision:number;providers:Json[];requests:Json[];service:Json;originalSelection:Json}&Record<string,unknown>);report:Json;counts:null|{results:number;runs:number;pending:number};activeRun:null|{operationId:string;provider:string;started:Json};nativeRuntime:Json;setup:{configured:boolean;profiles:Array<{alias:string;label:string;url:string}>;buyerTemplates:Array<{alias:string;title:string}>;sourceSha256?:string};uploads:Upload[];pendingRequests:Array<{operationId:string;action:Action;expectedRevision:number}>;transfers:Array<{id:string;jobId:string;files:number;originalManifestSha256:string}>}
export class CommissioningClient {
  constructor(options?:{origin?:string;token?:string;fetch?:typeof globalThis.fetch});
  request(path:string,options?:{method?:string;body?:unknown;raw?:boolean}):Promise<unknown>;
  authenticate(token:string):Promise<{authenticated:true}>;
  state():Promise<OperatorState>;
  release(id:string):Promise<Json>;
  history(options?:{kind?:'results'|'runs'|'pending';offset?:number;limit?:number;revision?:number}):Promise<HistoryPage>;
  prepare(command:Command):Promise<{request:Command;replayed:boolean}>;
  apply(command:Command):Promise<Receipt>;
  receive(operationId:string):Promise<Receiving>;
  beginUpload(input:{id:string;name:string;bytes:number;sha256:string}):Promise<Upload>;
  uploadState(id:string):Promise<Upload>;
  uploadChunk(id:string,offset:number,body:ArrayBuffer|Uint8Array):Promise<Upload>;
  completeUpload(id:string):Promise<Upload>;
  fileURL(options:{kind:'input'|'blob'|'buyer'|'buyer-execution'|'command'|'report'|'transfer';id?:string;name?:string}):string;
  archiveURL(operationId:string):string;
}
