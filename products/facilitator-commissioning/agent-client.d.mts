// SPDX-License-Identifier: MIT
import type {Command,FileRef,Receipt,Receiving,HistoryPage,OperatorState,Upload,Json,InstallationCatalog,InstallationView,NativeInstallationCatalog,NativeInstallationView} from './client.mjs';
export interface CustomerTransport {(name:string,args:Record<string,unknown>):Promise<any>}
export interface CustomerSource {kind:'input'|'blob'|'buyer'|'buyer-execution'|'command'|'report'|'transfer'|'archive'|'installation'|'installation-archive'|'installation-native';id?:string;name?:string;snapshotSha256?:string}
export interface CustomerFile {name:string;bytes:number;sha256:string;contentType:string}
export interface CaptureInput {jobId:string;captureId:string;file:CustomerSource;reportRevision?:number;expectedSha256?:string;expectedBytes?:number}
export interface CaptureManifest {schema:string;instance:string;jobId:string;captureId:string;request:CaptureInput&{instance:string};source:Record<string,unknown>;file:CustomerFile}
export interface CapturedFile {state:'CAPTURED';instance?:string;captureId?:string;manifest:CaptureManifest;manifestFile:CustomerFile;retained?:boolean}
export interface FileChunk {instance:string;captureId:string;manifestSha256:string;readId:string;file:CustomerFile;offset:number;bytesRead:number;nextOffset:number|null;encoding:'base64';data:string}
export interface CustomerOutcome {state:'COMPLETE'|'NOT_FOUND'|'PENDING'|'RECONCILIATION_REQUIRED'|'PREPARED';instance:string;jobId?:string;request?:Command;receipt?:Receipt;retained?:boolean;locallyRetained?:boolean;nativeResultPresent?:boolean;message?:string}
export interface CommissioningConnection {schema:'stellar-forge.facilitator-customer-connection.v1';instances:Record<string,{label:string;jobId:string;launchFile:string;inputs:Record<string,{path:string;name:string;bytes:number;sha256:string}>;receivers:Record<string,string>}>}
export class CommissioningCustomerClient{
  constructor(options:{callTool:CustomerTransport;instance:string});
  invoke(action:string,args?:Record<string,unknown>):Promise<any>;
  instances():Promise<{configured:boolean;instances:Array<{instance:string;label:string;jobId:string;inputs:Array<{source:string;name:string;bytes:number;sha256:string}>;receivers:string[]}>}>;
  state():Promise<{instance:string;native:OperatorState}>;
  installations(jobId:string):Promise<InstallationCatalog&{instance:string}>;
  installation(input:{jobId:string;operationId:string;kind?:'summary'|'sources'|'files';offset?:number;limit?:number}):Promise<InstallationView&{instance:string}>;
  installationReceivings(jobId:string):Promise<NativeInstallationCatalog&{instance:string}>;
  installationReceiving(input:{jobId:string;operationId:string;snapshotSha256:string;kind?:'summary'|'files'|'preview'|'saved'|'received';offset?:number;limit?:number}):Promise<NativeInstallationView&{instance:string}>;
  release(releaseId:string):Promise<{instance:string;release:Json}>;
  history(input:{jobId:string;revision:number;kind?:'results'|'runs'|'pending';offset?:number;limit?:number}):Promise<HistoryPage&{instance:string}>;
  allHistory(input:{jobId:string;revision:number;kind?:'results'|'runs'|'pending'}):Promise<{instance:string;jobId:string;revision:number;kind:string;items:Json[];total:number}>;
  sourceBegin(upload:{id:string;name:string;bytes:number;sha256:string}):Promise<Upload&{instance:string}>;
  sourceStatus(uploadId:string):Promise<Upload&{instance:string}>;
  sourceChunk(input:{uploadId:string;offset:number;data:string}):Promise<Upload&{instance:string}>;
  sourceComplete(uploadId:string):Promise<Upload&{instance:string}>;
  sourceImport(source:string,uploadId:string):Promise<Upload&{instance:string;source:string}>;
  prepare(command:Command):Promise<CustomerOutcome>;
  apply(operationId:string):Promise<CustomerOutcome>;
  receive(operationId:string):Promise<CustomerOutcome>;
  pending(input?:{offset?:number;limit?:number}):Promise<{instance:string;jobId:string;items:Array<{request:Command;receipt:Receipt|null}>;offset:number;total:number;nextOffset:number|null}>;
  capture(input:CaptureInput):Promise<CapturedFile>;
  manifest(captureId:string):Promise<CapturedFile>;
  file(input:{captureId:string;expectedManifestSha256:string;expectedSha256:string;readId?:string;offset?:number;limit?:number}):Promise<FileChunk>;
  fileRelease(captureId:string,readId:string):Promise<{state:'RELEASED';instance:string;captureId:string;readId:string}>;
  receiveArchive(input:{jobId:string;captureId:string;expectedManifestSha256:string;expectedSha256:string;receiver:string}):Promise<{state:'RECEIVED';instance:string;receiver:string;captureId:string;receipt:Record<string,unknown>}>;
}
