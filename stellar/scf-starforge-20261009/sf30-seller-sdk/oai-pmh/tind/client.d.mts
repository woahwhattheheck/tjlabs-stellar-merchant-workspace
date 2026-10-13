// MIT. Typed access to the original live TIND owner; no replacement engine.
export type JSONValue = null | boolean | number | string | JSONValue[] | {[key:string]:JSONValue};
export type JSONObject = {[key:string]:JSONValue};
export type ApplyKind = 'create'|'edition'|'profile'|'review'|'review-many'|'destination'|'destination-file'|'files'|'file-root'|'verify-files'|'prepare'|'receipt'|'file-receipt'|'reconcile'|'withdraw-batch'|'source-cases'|'source-case-review'|'source-download-plan'|'source-download-adopt'|'source-download-import'|'production-plan'|'production-review'|'production-disposition'|'production-prepare'|'production-reconcile'|'native-job-bind'|'native-job-import'|'native-job-receive';
export type NativeTask = 'search'|'send'|'source-download'|'job-read';
export type DownloadKind = 'record'|'batch'|'batch-file'|'handover'|'production-plan'|'source-acquisition'|'source-document'|'source-cases'|'source-case-review'|'file-receipt'|'destination-job'|'job-response';
export interface TindSourceBinding {schema:'stellar-forge.tind-source-binding.v1';kind:'file'|'directory';path:string;device:string;inode:string;alias?:string;bytes?:number;sha256?:string;modifiedNs?:string;changedNs?:string}
export function bindTindSource(path:string,kind?:'file'|'directory',alias?:string):Promise<TindSourceBinding>;
export interface ApplyRequest {operationId:string;kind:ApplyKind;projectId:string|null;expectedRevision:number|null;input:JSONObject}
export interface NativeRequest {operationId:string;task:NativeTask;projectId:string;expectedRevision:number;input:JSONObject}
export interface OperationSelection {kind?:'apply'|'native';operationId:string;projectId?:string;task?:NativeTask;acquisitionId?:string}
export interface LiveSummary {instanceId:string;ownership:'managed'|'owned';origin:string;bindingSha256:string;closing:boolean}
export interface RetainedExport {schema:'stellar-forge.tind-agent-export.v1';exportId:string;kind:DownloadKind;query:Record<string,string|number|boolean>;selectionSha256:string;workspaceRevisionsSha256:string;createdAt:string;filename:string;file:{name:string;bytes:number;sha256:string;contentType:string}}
export interface AttachmentOptions {directory:string;mode?:'managed'|'owned';pythonExecutable?:string;environment?:Record<string,string|undefined>;exportDirectory:string}
export const LIVE_SCHEMA:string;
export const MAX_REQUEST_BYTES:number;
export const MAX_TIND_PACKAGE_BYTES:number;
export function tindError(code:string,message:string,extra?:Record<string,unknown>):Error&{code:string};
export function canonical<T>(value:T):T;
export function sha256(value:string|Uint8Array):string;
export function privateDirectory(path:string,options?:{create?:boolean}):Promise<string>;
export function readPrivate(path:string,maximum?:number):Promise<import('node:buffer').Buffer>;
export function attachTindWorkspace(options:AttachmentOptions):Promise<TindWorkspaceClient>;
export class TindWorkspaceClient {
 private constructor(context:unknown);
 readonly instanceId:string;
 readonly ownership:'managed'|'owned';
 readonly summary:LiveSummary;
 verify():Promise<LiveSummary>;
 get(path:string,query?:Record<string,string|number|boolean|null|undefined>):Promise<JSONObject>;
 preview(kind:'source-case'|'destination-job',body:JSONObject):Promise<JSONObject>;
 apply(request:ApplyRequest):Promise<JSONObject>;
 native(request:NativeRequest):Promise<JSONObject>;
 operation(selection:OperationSelection):Promise<{saved:JSONObject|null;observed:JSONObject}>;
 resume(selection:{kind?:'apply'|'native';operationId:string}):Promise<JSONObject>;
 pause(projectId:string,acquisitionId:string):Promise<{pauseRequested:boolean}>;
 download(input:{exportId:string;kind:DownloadKind;query?:Record<string,string|number|boolean>;expectedSelectionSha256?:string}):Promise<RetainedExport>;
 retained(exportId:string):Promise<{readonlyFileHandle:import('node:fs/promises').FileHandle;bytes:number;sha256:string;name:string;type:string}>;
 requestClose():void;
 close():Promise<{instanceId:string;ownership:'managed'|'owned';state:'DETACHED'|'CLOSED'}>;
}
export const READ_PATHS:ReadonlySet<string>;
export const DOWNLOAD_PATHS:Readonly<Record<DownloadKind,string>>;
export const DOWNLOAD_NAMES:Readonly<Record<DownloadKind,string>>;
