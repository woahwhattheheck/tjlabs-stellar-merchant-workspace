import type {FileHandle} from 'node:fs/promises';
export interface DirectusScope {operatorId:string;instanceId:string;projectKey:string;workspaceId:string}
export interface DirectusAttachOptions {directory:string;workspaceDirectory?:string;projectKey?:string;mode?:'managed'|'owned';exportDirectory:string;environment?:Record<string,string|undefined>}
export interface DirectusRequest {action:string;input:{operationId:string;actor:string;expectedRevision:number;[key:string]:unknown}}
export interface DirectusExport {kind:'project'|'source'|'dataset'|'config'|'comparison'|'buyer-config'|'record'|'native-response'|'delivery';id?:string;recordKind?:string;name?:string;sha256?:string;expectedRevision?:number}
export const DIRECTUS_MAX_FILE:number;
export function attachDirectusWorkspace(options:DirectusAttachOptions):Promise<DirectusOperatorClient>;
export function originalFileIdentity(path:string):Promise<{path:string;bytes:number;sha256:string;device:string;inode:string;modified:string;changed:string}>;
export function readDirectusRuntime(file:string):Promise<{file:string;merchantRuntime:Record<string,unknown>;identity:Record<string,unknown>}>;
export function readPrivate(path:string,maximum?:number):Promise<Buffer>;
export function privateDirectory(path:string,options?:{create?:boolean}):Promise<string>;
export const directusError:(code:string,message:string,status?:number)=>Error;
export class DirectusOperatorClient {
 readonly instanceId:string;readonly workspaceId:string;readonly summary:DirectusScope&Record<string,unknown>;
 verify(options?:{allowProjectChange?:boolean}):Promise<DirectusScope&Record<string,unknown>>;
 view(view:string,query?:Record<string,unknown>):Promise<unknown>;
 save(request:DirectusRequest,options?:{sourcePath?:string;sourceAlias?:string}):Promise<Record<string,unknown>>;
 operation(id:string):Promise<Record<string,unknown>|null>;resume(id:string):Promise<unknown>;cancel(id:string):Promise<unknown>;
 selectProject(key:string):Promise<unknown>;connection(value:{baseUrl:string;token:string}):Promise<unknown>;
 merchant(action:'start'|'stop',merchantId:string,runtime?:Record<string,unknown>):Promise<unknown>;
 receive(id:string,sourcePath?:string|(()=>Promise<string>),options?:{sourceAlias?:string}):Promise<unknown>;
 export(id:string,selection:DirectusExport):Promise<{exportId:string;workspaceId:string;path:string;metadata:Record<string,unknown>}>;
 retained(id:string):Promise<{readonlyFileHandle:FileHandle;bytes:number;sha256:string;name:string;type:string}>;
 requestClose():void;close():Promise<{instanceId:string;state:'CLOSED'|'DETACHED'}>;
}
