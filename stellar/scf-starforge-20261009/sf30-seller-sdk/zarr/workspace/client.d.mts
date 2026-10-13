/** Typed original Zarr operator and host-declared attachment contract. */
export type UUID=string;
export type Sha256=string;
export type Axis=number|{start:number;stop:number;step:number};
export type NativeValue=
 |{kind:'boolean';value:boolean}|{kind:'text'|'integer'|'float';value:string}
 |{kind:'bytes';base64:string}|{kind:'complex';real:NativeValue;imaginary:NativeValue}
 |{kind:'datetime'|'timedelta';dtype:string;ticks:string;display:string}
 |{kind:'record';fields:Record<string,NativeValue>}
 |{kind:'subarray';shape:number[];values:NativeValue[]};
export interface ResultRow{ordinal:number;sourceIndex:number[];value:NativeValue}
export interface SourceInput{id:string;title:string;path:string;kind:'directory'|'zip'|'packet';root?:string;provenance:Record<string,unknown>;sha256?:Sha256}
export interface ConnectionsDeclaration{
 schema:'stellar-forge.zarr-workspace-connections.v1';inputs:SourceInput[];
 destinations:Array<{id:string;title:string;path:string}>;publisher?:{seller:string;resource:string}
}
export interface IntentInputMap{
 import:{inputId:string;title:string;maxBytes?:number;maxFiles?:number};
 selection:{sourceId:Sha256;array:string;axes:Axis[];title:string;maxCells?:number;maxNativeBytes?:number};
 run:{selectionId:Sha256};
 review:{resultId:Sha256;contentSha256:Sha256;decision:'accepted'|'needs-changes'|'rejected';comment:string};
 freeze:{resultId:Sha256;reviewId:Sha256;title:string;valueType:'text'|'number'|'boolean'};
 abandon:{operationId:UUID;reason:string};
}
export type NativeAction=keyof IntentInputMap;
export type Intent<A extends NativeAction=NativeAction>={id:UUID;action:A;expectedRevision:number;input:IntentInputMap[A]};
export interface PreparedRequest{
 schema:'stellar-forge.zarr-operator-request.v1';workspaceId:UUID;connectionsSha256:Sha256;
 intent:Intent;binding:{inputId:string}|null;request:{id:UUID;action:NativeAction;expectedRevision:number;input:Record<string,unknown>};requestSha256:Sha256
}
export interface NativeReceipt{operationId:UUID;state:'COMPLETE';revision:number;item:Record<string,unknown>;replayed?:boolean}
export interface WorkspaceIdentity{
 schema:'stellar-forge.zarr-workspace-identity.v1';workspaceId:UUID;
 storage:{directory:{path:string;device:string;inode:string};database:{device:string;inode:string}};sha256:Sha256
}
export interface FrozenSource{id:Sha256;title:string;file:string;sourceSha256:Sha256;sourceBytes:number;resultId:Sha256;reviewId:Sha256;rowCount:number;valueType:'text'|'number'|'boolean';createdAt:string;sourceFile?:string}
export interface NativeOperation{id:UUID;request:Record<string,unknown>;request_sha:Sha256;admitted_revision:number;state:'RUNNING'|'INTERRUPTED'|'COMPLETE'|'ABANDONED';result:NativeReceipt|null;error:unknown}
export interface NativeStatus{
 schema:'stellar-forge.zarr-workspace.v1';workspaceId:UUID;revision:number;sources:Record<string,unknown>[];
 selections:Record<string,unknown>[];results:Record<string,unknown>[];reviews:Record<string,unknown>[];frozen:FrozenSource[];operations:NativeOperation[]
}
export interface ResultPage{result:Record<string,unknown>;rows:ResultRow[];offset:number;next:number|null;total:number}
export interface FileIdentity{id:UUID;name:string;bytes:number;sha256:Sha256}
export interface FileRange{file:FileIdentity;offset:number;bytes:number;next:number|null;sha256:Sha256;encoding:'base64';content:string}
export type PublisherAction='source'|'status'|'target'|'plan'|'run'|'inspect'|'buyer-offer'|'save-plan'|'extract'|'cancel'|'review'|'publish'|'recover'|'prepare-buyer';
export interface PublisherRequest{frozenId:Sha256;action:PublisherAction;input:Record<string,unknown>;requestId?:UUID}
export interface Connection{
 schema:'stellar-forge.zarr-operator-connection.v1';instanceId:UUID;pid:number;workspaceId:UUID;workspaceSha256:Sha256;
 directory:string;sourceSha256:Sha256;connectionsSha256:Sha256;origin:string;token:string
}
export interface ManagedStartup{
 schema:'stellar-forge.zarr-workspace-startup.v1';status:'ZARR_WORKSPACE_READY';instanceId:UUID;pid:number;
 directory:string;workspaceId:UUID;workspaceIdentity:WorkspaceIdentity;workspaceSha256:Sha256;
 sourceDirectory:string;launchSourceDirectory:string;sourceSha256:Sha256;sourceFiles:Array<{path:string;bytes:number;sha256:Sha256}>;
 connectionsFile:string;connectionsSha256:Sha256;connectionFile:string;connectionSha256:Sha256;zarrWorkspace:string
}
export declare class ZarrWorkspaceClient{
 constructor(connection:Connection);connection:Connection;
 request<T=unknown>(path:string,options?:{method?:'GET'|'POST';body?:unknown}):Promise<T>;
 connect():Promise<Record<string,unknown>>;close():Promise<void>
}
export declare class ZarrWorkspace{
 constructor(options:{directory:string;python?:string;sourceDirectory?:string;connections:unknown});
 identity:WorkspaceIdentity;directory:string;sourceDirectory:string;
 open(options?:{create?:boolean;owner?:boolean}):Promise<this>;status():Promise<NativeStatus>;
 operation(id:UUID):Promise<NativeOperation>;result(id:Sha256,offset?:number,limit?:number):Promise<ResultPage>;
 frozen(id:Sha256):Promise<FrozenSource>;prepare(intent:Intent):Promise<PreparedRequest>;
 apply(request:PreparedRequest):Promise<NativeReceipt>;resume(id:UUID):Promise<NativeReceipt>;
 export(id:UUID):Promise<{operationId:UUID;native:unknown;file:FileIdentity}>;
 receive(input:{id:UUID;inputId:string;destinationId:string}):Promise<{operationId:UUID;directory:string;native:unknown}>;
 close():Promise<void>
}
