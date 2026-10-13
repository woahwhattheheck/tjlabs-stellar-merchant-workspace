export type SupersetAction='source'|'capture'|'edition'|'review'|'compare'|'select'|'replay'|'prepare-merchant'|'publish'|'prepare-buyer'|'receive-buyer'|'buyer-session-init'|'buyer-session-run'|'buyer-session-recover'|'receive-workspace';
export interface SupersetRequest {action:SupersetAction;input:{operationId:string;expectedRevision:number;[key:string]:unknown}}
export interface SupersetRuntimeIdentity {path:string;bytes:number;sha256:string;device:string;inode:string;modified:string;changed:string}
export interface SupersetAttachmentOptions {directory:string;workspaceDirectory?:string;mode?:'managed'|'owned';exportDirectory:string;runtimeFile?:string;runtimeIdentity?:SupersetRuntimeIdentity;environment?:Record<string,string|undefined>}
export interface SupersetFileSelection {kind:'workspace'|'capture'|'comparison'|'csv'|'lineage'|'record'|'response'|'delivery';id?:string;recordKind?:string;name?:string;sha256?:string;expectedRevision?:number}
export interface SupersetFileReceipt {exportId:string;workspaceId:string;path:string;metadata:{request:Record<string,unknown>;workspaceId:string;file:{path:string;name:string;bytes:number;sha256:string;contentType:string}}}
export function attachSupersetWorkspace(options:SupersetAttachmentOptions):Promise<SupersetOperatorClient>;
export class SupersetOperatorClient {
 readonly instanceId:string;readonly workspaceId:string;readonly summary:Record<string,unknown>;
 verify():Promise<Record<string,unknown>>;
 view(view:string,query?:Record<string,unknown>):Promise<unknown>;
 operation(id:string):Promise<{workspaceId:string;saved:Record<string,unknown>|null;operation:Record<string,unknown>|null}>;
 save(request:SupersetRequest,options?:{sourcePath?:string;sourceAlias?:string;destinationPath?:string;destinationAlias?:string}):Promise<unknown>;
 resume(id:string):Promise<unknown>;cancel(id:string):Promise<unknown>;
 merchant(action:'start'|'stop',id:string):Promise<unknown>;
 export(id:string,selection:SupersetFileSelection):Promise<SupersetFileReceipt>;
 retained(id:string):Promise<{readonlyFileHandle:import('node:fs/promises').FileHandle;bytes:number;sha256:string;name:string;type:string}>;
 requestClose():void;close():Promise<{instanceId:string;state:'DETACHED'|'CLOSED'}>;
}
export const SUPERSET_MAX_FILE:number;
export function readPrivate(path:string,maximum?:number):Promise<Buffer>;
export function privateDirectory(path:string,options?:{create?:boolean}):Promise<string>;
export function originalFileIdentity(path:string):Promise<{path:string;bytes:number;sha256:string;device:string;inode:string;modified:string;changed:string}>;
export function supersetError(code:string,message:string,status?:number):Error&{code:string;status:number};

export function readSupersetRuntime(file:string):Promise<{file:string;merchantRuntime:Record<string,unknown>;identity:SupersetRuntimeIdentity}>;

export interface SupersetPendingCleanup {
 readonly instanceId:string;readonly workspaceId:string;readonly summary:Record<string,unknown>;
 requestClose():void;close():Promise<{instanceId:string;state:'CLOSED'}>;
}
export interface SupersetAttachmentError extends Error {
 supersetCleanup?:SupersetPendingCleanup;
 cleanupFailure?:{code:string;message:string};
}
