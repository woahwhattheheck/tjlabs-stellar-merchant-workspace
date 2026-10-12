/** MIT. Native commissioning SDK. IDs, revisions and results belong to the original engine. */
export type UUID=string;
export type SHA256=string;
export type NativeAction='inspect'|'run-chart'|'dbt-deps'|'dbt-build'|'compile'|'start-preview'|'stop-preview'|'validate'|'deploy'|'download'|'upload';
export interface CallOptions {signal?:AbortSignal;timeoutMs?:number}
export interface SourceRequest {requestId:UUID;expectedRevision:number}
export interface FileIdentity {bytes:number;sha256:SHA256}
export interface SourceMember extends FileIdentity {path:string;executable?:boolean}
export interface NativeResult {
 state:string;status?:string;dispatched?:boolean;
 artifacts?:Array<FileIdentity&{id:string;relativePath?:string;path?:string;scope:'native-content'|'operator-private'|string}>;
 artifactManifest?:FileIdentity&{path?:string};
 contentExports?:unknown[];
 native?:Record<string,unknown>;
 [key:string]:unknown;
}
export interface Operation {
 id:string;action:NativeAction;editionId:UUID;status:string;requestSha256:SHA256;
 plan:Record<string,unknown>;nativeResult?:NativeResult;inspection?:Record<string,unknown>;[key:string]:unknown;
}
export interface WorkspaceState {
 workspace:string;instanceId:UUID;browserUrl:string;
 native:{metadata:{id:UUID;revision:number;connection:Record<string,unknown>;[key:string]:unknown};
  editions:Array<{id:UUID;sourceSha256:SHA256;fileCount:number;[key:string]:unknown}>;
  reviews:Array<{id:UUID;[key:string]:unknown}>;operations:Operation[];drafts:unknown[];
  pendingOperationIds:string[];[key:string]:unknown};
 background:string[];files:Record<string,unknown>;
}
export interface SourceResult<T=unknown> {workspace:string;requestId:UUID;replayed?:boolean;result?:T;state?:'OBSERVATION_REQUIRED';current?:WorkspaceState;request?:unknown}
export interface FileSelection {
 kind:'source'|'artifact'|'handover'|'handover-request';
 editionId?:UUID;draft?:boolean;expectedDraftId?:UUID;path?:string;
 operationId?:string;artifactId?:string;handoverId?:UUID;includeOperatorPrivate?:boolean;
}
export interface FileChunk {
 workspace:string;workspaceId:UUID;selection:FileSelection;readId:UUID;
 file:FileIdentity&{name:string;contentType:string};offset:number;bytesRead:number;nextOffset:number|null;encoding:'base64';data:string;
}
export interface OriginalHandoverRequest {
 schema:'lightdash.commissioning-handover-request.v1';id:UUID;workspaceId:UUID;workspaceRevision:number;
 applicationSourceSha256:SHA256;includeOperatorPrivate:boolean;createdAt:string;
 originalDatabase?:FileIdentity;[key:string]:unknown;
}
export interface HandoverStatus {
 workspace:string;pending?:boolean;native:{id:UUID;state:string;request:OriginalHandoverRequest|null;
 result?:{state:string;archive?:FileIdentity;[key:string]:unknown}|null;[key:string]:unknown};
}
export type ContentSelection={kind:'edition';directory?:string}|{kind:'download';operationId:string;manifestSha256:SHA256};
export interface PlanInput {
 projectUuid?:UUID;startOperationId?:string;resumeOf?:string;
 name?:string;previewProjectUuid?:UUID;expiresInHours?:number;skipCopyContent?:boolean;
 warehouseCredentials?:'profiles'|'copy-upstream';severity?:'error'|'warning';only?:string[];
 chartPath?:string;limit?:number;pageSize?:number;applySpaceAccess?:boolean;[key:string]:unknown;
}
export interface LightdashClient {
 readonly url:string;readonly workspace:string;readonly workspaceId:UUID;readonly current:Record<string,unknown>;
 call(tool:string,args?:Record<string,unknown>,options?:CallOptions):Promise<Record<string,unknown>>;
 close():Promise<void>;
 open(args?:Record<string,never>,options?:CallOptions):Promise<WorkspaceState>;
 closeWorkspace(args:{instanceId:UUID},options?:CallOptions):Promise<{state:'CLOSED';workspace:string;instanceId:UUID}>;
 status(args?:Record<string,never>,options?:CallOptions):Promise<WorkspaceState>;
 inputs(args?:{input?:string},options?:CallOptions):Promise<Record<string,unknown>>;
 configure(args:SourceRequest&{connection:string|null;label?:string},options?:CallOptions):Promise<SourceResult>;
 intake(args:SourceRequest&{input:string;expectedManifestSha256:SHA256;operationId:string;label?:string;note?:string},options?:CallOptions):Promise<SourceResult>;
 manifest(args:{editionId?:UUID;draft?:boolean;expectedDraftId?:UUID},options?:CallOptions):Promise<{workspace:string;native:{files:SourceMember[];[key:string]:unknown}}>;
 select(args:SourceRequest&{baselineId?:UUID;selectedId?:UUID},options?:CallOptions):Promise<SourceResult>;
 createDraft(args:SourceRequest&{editionId:UUID},options?:CallOptions):Promise<SourceResult>;
 selectDraft(args:SourceRequest&{draftId:UUID},options?:CallOptions):Promise<SourceResult>;
 editDraft(args:SourceRequest&{path:string;content?:string;remove?:boolean;expectedFileSha256?:SHA256|null;expectedDraftId:UUID},options?:CallOptions):Promise<SourceResult>;
 seal(args:SourceRequest&{label:string;note?:string;expectedDraftId:UUID},options?:CallOptions):Promise<SourceResult>;
 compare(args:{baselineId:UUID;candidateId:UUID},options?:CallOptions):Promise<{workspace:string;native:unknown}>;
 review(args:SourceRequest&{baselineId:UUID;candidateId:UUID;reviewedBy:string;note:string;decisions:unknown[]},options?:CallOptions):Promise<SourceResult>;
 plan(args:{operationId:string;action:NativeAction;editionId:UUID;expectedRevision:number;input?:PlanInput;content?:ContentSelection},options?:CallOptions):Promise<{workspace:string;operation:Operation}>;
 operation(args:{operationId:string},options?:CallOptions):Promise<{workspace:string;operation:Operation;pending:boolean}>;
 execute(args:{operationId:string;expectedRequestSha256:SHA256},options?:CallOptions):Promise<{workspace:string;operationId:string;accepted:true;pending:true;operation:Operation}>;
 inspect(args:{operationId:string;expectedRequestSha256:SHA256},options?:CallOptions):Promise<{workspace:string;operation:Operation;replayed?:boolean}>;
 waitOperation(operationId:string,options?:{timeoutMs?:number;pollMs?:number;signal?:AbortSignal}):Promise<{workspace:string;operation:Operation;pending:boolean}>;
 content(args:{operationId:string},options?:CallOptions):Promise<{workspace:string;exports:unknown[]}>;
 createHandover(args:{handoverId:UUID;expectedRevision:number;includeOperatorPrivate?:boolean},options?:CallOptions):Promise<{workspace:string;handoverId:UUID;accepted:true;request:unknown}>;
 handoverStatus(args:{handoverId:UUID},options?:CallOptions):Promise<HandoverStatus>;
 inspectHandover(args:{handoverId:UUID},options?:CallOptions):Promise<Record<string,unknown>>;
 resumeHandover(args:{handoverId:UUID},options?:CallOptions):Promise<Record<string,unknown>>;
 readFile(args:FileSelection&{readId?:UUID;expectedSha256?:SHA256;offset?:number;limit?:number},options?:CallOptions):Promise<FileChunk>;
 releaseFile(args:{readId:UUID},options?:CallOptions):Promise<{state:'RELEASED'}>;
 request(args:{requestId:UUID},options?:CallOptions):Promise<{workspace:string;request:unknown;current:WorkspaceState}>;
}
export interface DownloadedFile extends FileIdentity {
 state:'COMPLETE';file:string;selection:FileSelection;workspaceId:UUID;replayed?:boolean;
}
export interface DownloadedHandover {
 schema:'stellar-forge.lightdash-handover-download.v1';state:'COMPLETE';workspaceId:UUID;handoverId:UUID;
 archive:DownloadedFile;requestFile:DownloadedFile;applicationManifestSha256:SHA256;workspaceRevision:number;includeOperatorPrivate:boolean;
}
export function connectLightdash(options:{
 url:string;tokenEnv?:string;environment?:Record<string,string|undefined>;workspace?:string;
 expectedWorkspaceId:UUID;expectedInstanceId?:UUID;signal?:AbortSignal;
}):Promise<LightdashClient>;
export function connectProject(directory:string,options?:{signal?:AbortSignal}):Promise<LightdashClient&{project:Record<string,unknown>;session:Record<string,unknown>}>;
export function downloadFile(client:LightdashClient,options:{
 selection:FileSelection;outputDirectory:string;filename:string;expectedSha256?:SHA256;signal?:AbortSignal;
}):Promise<DownloadedFile>;
export function downloadHandover(client:LightdashClient,options:{
 handoverId:UUID;outputDirectory:string;includeOperatorPrivate?:boolean;signal?:AbortSignal;
}):Promise<DownloadedHandover>;
