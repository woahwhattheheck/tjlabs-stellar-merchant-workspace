/// <reference types="node" />
export type NativeId=string;
export type Sha256=string;
export interface AlliumConnectionView {
  instanceId:string; workspaceId:NativeId; startedAt:string; origin:string; pid:number;
}
export interface AlliumConnection {
  path:string; sha256:Sha256; token:string;
  value:AlliumConnectionView & {schema:string;directory:string;directoryIdentity:{dev:string;ino:string};url:string};
}
export interface ProductRevision {
  id:NativeId; productText:string; product:Record<string,unknown>; [field:string]:unknown;
}
export interface Acquisition {
  id:NativeId; revisionId:NativeId; kind:"query"|"import"; status:string; [field:string]:unknown;
}
export interface AlliumState {
  schema:"stellar-forge.allium-workspace.v1"; id:NativeId; name:string; directory:string;
  createdAt:string; updatedAt:string; revision:number; head:NativeId; current:ProductRevision;
  revisions:Array<Record<string,unknown>>; acquisitions:Acquisition[];
  configurations:Array<Record<string,unknown>>; configurationId:NativeId|null;
  versions:Record<string,unknown>|null; runtime:{status:"RUNNING"|"STOPPED";[field:string]:unknown};
  publisher:Record<string,unknown>|null; operations:Array<Record<string,unknown>>;
  imports:Array<{createdAt:string;exportId:NativeId;manifestSha256:Sha256;sourceDirectory:string}>;
  credentials:{apiKeyEnv:string;available:boolean}; limits:{productBytes:number;resultBytes:number;bundleBytes:number};
}
export interface NativeMutation<T=unknown> {result:T;state:AlliumState}
export interface OriginalBundle {
  schema:"stellar-forge.allium-workspace-export.v1"; id:NativeId; workspaceId:NativeId;
  createdAt:string; sourceDirectory:string; runtime:"STOPPED"; manifestSha256:Sha256;
  files:Array<{path:string;bytes:number;sha256:Sha256;base64:string}>;
}
export interface MerchantTerms {
  origin:string; path?:string; payment:Record<string,unknown>;
  settings?:{retentionMs?:number;maxVersions?:number;maxRetainedBytes?:number};
}
export interface MerchantLaunch {port?:number;facilitator?:string|null;allowLocalFacilitator?:boolean}
export interface DownloadSelection {acquisitionId:NativeId;kind:"result"|"source"|"csv"|"dataset"|"run"}
export interface OriginalDownload {bytes:Buffer;headers:Headers;sha256:Sha256}
export declare const ALLIUM_CONNECTION_SCHEMA:"stellar-forge.allium-live-connection.v1";
export declare const ALLIUM_STARTUP_SCHEMA:"stellar-forge.allium-workspace-startup.v1";
export declare const ALLIUM_CONNECTION_FILENAME:"allium.connection.json";
export declare const ALLIUM_MAX_RESPONSE_BYTES:number;
export declare const ALLIUM_MAX_CONTROL_BYTES:number;
export declare function readAlliumConnection(path:string,options?:{directory?:string;workspaceId?:string|null}):Promise<AlliumConnection>;
export declare function alliumConnectionView(connection:AlliumConnection):AlliumConnectionView;
export declare function inspectAlliumListener(connection:AlliumConnection):Promise<AlliumConnectionView&{schema:string;directory:string}>;
export declare function alliumRequest(connection:AlliumConnection,path:string,options?:{
  method?:"GET"|"POST";body?:unknown;signal?:AbortSignal;maximum?:number;fetchImpl?:typeof fetch;raw?:boolean;
}):Promise<unknown>;
export declare function alliumDigest(bytes:Buffer):Sha256;
export declare function alliumReadPrivateFile(path:string,maximum?:number):Promise<{path:string;bytes:Buffer;sha256:Sha256}>;
export declare function alliumReadPrivateJson(path:string,maximum?:number):Promise<{path:string;bytes:Buffer;sha256:Sha256;value:unknown}>;
export declare function alliumWritePrivateJson(path:string,value:unknown,options?:{replace?:boolean}):Promise<{path:string;bytes:number;sha256:Sha256}>;
export declare class AlliumWorkspaceClient {
  constructor(connection:AlliumConnection);
  static connect(path:string,options?:{directory?:string;workspaceId?:string|null;expectedInstanceId?:string}):Promise<AlliumWorkspaceClient>;
  readonly connection:AlliumConnectionView;
  browser():Promise<AlliumConnectionView&{url:string}>;
  state():Promise<AlliumState>;
  revision(id:NativeId):Promise<ProductRevision>;
  acquisition(id:NativeId):Promise<Acquisition>;
  saveProduct(input:{operationId:NativeId;expectedHead:NativeId;productText:string;note?:string}):Promise<NativeMutation<{revisionId:NativeId}>>;
  restoreProduct(input:{operationId:NativeId;expectedHead:NativeId;revisionId:NativeId;note?:string}):Promise<NativeMutation<{revisionId:NativeId}>>;
  importResult(input:{operationId:NativeId;revisionId:NativeId;resultBase64:string;filename?:string;note?:string}):Promise<NativeMutation>;
  startQuery(input:{operationId:NativeId;revisionId:NativeId;note?:string}):Promise<NativeMutation>;
  resumeQuery(input:{acquisitionId:NativeId}):Promise<NativeMutation>;
  collectQuery(input:{acquisitionId:NativeId}):Promise<NativeMutation>;
  recoverQuery(input:{acquisitionId:NativeId;runId:string}):Promise<NativeMutation>;
  query(input:{acquisitionId:NativeId;query?:string}):Promise<NativeMutation>;
  configure(input:MerchantTerms&{operationId:NativeId;acquisitionId:NativeId;expectedConfigurationId:NativeId|null}):Promise<NativeMutation>;
  startMerchant(input:MerchantLaunch&{expectedConfigurationId:NativeId}):Promise<NativeMutation>;
  stopMerchant(input:{expectedSessionId:NativeId}):Promise<NativeMutation>;
  refresh(input:{acquisitionId:NativeId;expectedSnapshot:Sha256;expectedRevision:number}):Promise<NativeMutation>;
  activate(input:{snapshot:Sha256;expectedSnapshot:Sha256;expectedRevision:number}):Promise<NativeMutation>;
  collectVersions():Promise<NativeMutation>;
  openPublisher():Promise<NativeMutation>;
  stageForPublisher(input:{operationId:NativeId;acquisitionId:NativeId}):Promise<NativeMutation>;
  download(input:DownloadSelection):Promise<OriginalDownload>;
  exportBundle(input?:{expectedRevision?:number}):Promise<OriginalDownload&{bundle:OriginalBundle}>;
  close():Promise<void>;
}
