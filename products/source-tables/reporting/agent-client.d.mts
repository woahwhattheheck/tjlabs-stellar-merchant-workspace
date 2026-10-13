/** Complete installed Reporting Programmes client. MIT. */
export type Sha256 = string;
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type TransportOptions = {requestSignal?:AbortSignal;timeoutMs?:number};
export interface MerchantTransport {
  readonly endpoint:string;
  call(name:string,args:Record<string,Json>,options?:TransportOptions):Promise<unknown>;
}
export interface Selection {endpoint:string;workspace:string;nativeId:string|null;instanceId:string|null}
export interface FileIdentity {name:string;bytes:number;sha256:Sha256;type:string}
export interface Publication {
  publicationId:Sha256;operationId:string;format:'project'|'native'|'request'|'input';
  projectSha256:Sha256|null;file:FileIdentity;
}
export interface OriginalInput {role:'input'|'context';alias:string;file:FileIdentity}
export interface ReportingOperation {
  operationId:string;requestSha256:Sha256;request:{bytes:number;sha256:Sha256};
  kind:'apply'|'receive_desk'|'receive_project'|'export';
  state:'prepared'|'complete'|'failed';beforeProjectSha256:Sha256|null;afterProjectSha256:Sha256|null;
  inputFiles:OriginalInput[];publications:Publication[];
  createdAt:string;finishedAt?:string;error?:{code:string;message:string};domain?:Json;
}
export interface CommonReply {
  workspace:string;native:{id:string;revision:number};instanceId:string;
  project:{projectSha256:Sha256|null;summary:Json};
}
export interface OperationReply extends CommonReply {operation:ReportingOperation;replayed?:boolean}
export interface StatusReply extends CommonReply {pending:ReportingOperation|null}
export interface PublicationReply extends CommonReply {publication:Publication}
export interface InputReply extends CommonReply {input:{alias:string;file:FileIdentity};publication:Publication}
export interface InputRow {alias:string;available:boolean;label?:string;file?:FileIdentity;error?:{code:string;message:string}}
export interface Page {offset:number;limit:number;total:number;nextOffset:number|null}
export interface CollectionReply<T> extends CommonReply {items:T[];page:Page}
export interface WorkspacesReply {workspaces:Array<{workspace:string;label:string;opened:boolean}>}
export interface ApplyArgs {input:string;expectedSha256:Sha256;operationId:string;expectedProjectSha256:Sha256|null}
export interface DeskArgs extends ApplyArgs {context:string;expectedContextSha256:Sha256}
export interface ExportArgs {operationId:string;format:'project'|'native';expectedProjectSha256:Sha256}
export type Mutation = 'apply'|'receive_desk'|'receive_project'|'export';
export interface PreparedRequest {
  readonly schema:'stellar-forge.reporting-agent-client.v1';readonly endpoint:string;
  readonly workspace:string;readonly nativeId:string;readonly tool:string;
  readonly args:Readonly<(ApplyArgs|DeskArgs|ExportArgs)&{workspace:string}>;
  /** Digest of the complete client selection/tool/args; distinct from host requestSha256. */
  readonly clientRequestSha256:Sha256;
}
export interface DownloadResult {
  schema:'stellar-forge.reporting-agent-download-result.v1';state:'COMPLETE';directory:string;
  exportId:Sha256;workspace:string;nativeId:string;publicationId:Sha256;publication:Publication;
  manifestSha256:Sha256;resumed:boolean;resumedBytes:number;files:number;bytes:number;
}
export interface DownloadOptions {
  directory:string;chunkSize?:number;signal?:AbortSignal;onProgress?:(progress:unknown)=>void|Promise<void>;
}
export interface ExecutionResult {directory:string;prepared:PreparedRequest;attemptId:string;result:OperationReply}
export interface RecoveryOptions {
  directory:string;
  /** Optional previously reviewed host fingerprint. Complete retained envelope is always independently compared. */
  expectedRequestSha256?:Sha256;
}
export interface ReportingProgrammeClient {
  selection():Readonly<Selection>;
  workspaces(options?:TransportOptions):Promise<WorkspacesReply>;
  status(options?:TransportOptions):Promise<StatusReply>;
  readAll(action:'inputs',input?:{limit?:number},options?:TransportOptions):Promise<CollectionReply<InputRow>>;
  readAll(action:'history',input?:{limit?:number},options?:TransportOptions):Promise<CollectionReply<ReportingOperation>>;
  readAll(action:'publications',input?:{limit?:number},options?:TransportOptions):Promise<CollectionReply<Publication>>;
  inspectInput(input:string,expectedSha256:Sha256,options?:TransportOptions):Promise<InputReply>;
  operation(operationId:string,options?:TransportOptions):Promise<OperationReply>;
  publication(publicationId:Sha256,options?:TransportOptions):Promise<PublicationReply>;
  prepare(kind:'apply'|'receive_project',args:ApplyArgs):Promise<PreparedRequest>;
  prepare(kind:'receive_desk',args:DeskArgs):Promise<PreparedRequest>;
  prepare(kind:'export',args:ExportArgs):Promise<PreparedRequest>;
  download(publicationId:Sha256,options:DownloadOptions):Promise<DownloadResult>;
  execute(request:PreparedRequest,options:{directory:string}):Promise<ExecutionResult>;
  recover(options:RecoveryOptions):Promise<ExecutionResult>;
  /** Explicit replay uses exact saved original tool arguments and retained source input publications. */
  replay(options:{directory:string}):Promise<ExecutionResult>;
  reopen():Promise<StatusReply>;
  close():Promise<CommonReply&{closed:true}>;
}
export interface OpenReportingProgrammeClientOptions {
  url?:string;client?:MerchantTransport;tokenEnv?:string;environment?:Record<string,string|undefined>;
  signal?:AbortSignal;workspace:string;expectedNativeId?:string;maximumResponseBytes?:number;
}
export function openReportingProgrammeClient(options:OpenReportingProgrammeClientOptions):Promise<ReportingProgrammeClient>;
