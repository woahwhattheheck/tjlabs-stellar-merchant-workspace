/// <reference types="node" />
import type {Buffer} from 'node:buffer';
export type JSONValue=null|boolean|number|string|JSONValue[]|{[key:string]:JSONValue};
export type NativeRecord={ [key:string]:JSONValue };
export interface Branch {id:string;directory:string}
export interface ClientOptions {
 connectionFile:string;workspaceId:string;workspaceDirectory:string;
 selectedBranch?:Branch;timeoutMs?:number;
}
export interface Command {
 requestId:string;kind:string;actor:{id:string;name:string};at:string;body:NativeRecord;
}
export interface PageOptions {offset?:number;limit?:number}
export interface FileDescriptor {bytes:number;sha256:string}
export type DownloadSelection=
 |{kind:'blob';id:string;expectedSha256?:string;expectedBytes?:number}
 |{kind:'archive';id:string;expectedSha256:string;expectedBytes:number}
 |{kind:'report';id:string;format?:'json'|'html'|'csv';expectedSha256?:string;expectedBytes?:number};
export class PropertyContinuityError extends Error {
 code:string;status:number|null;result:JSONValue|null;uncertain:boolean;operation:JSONValue|null;
}
export class PropertyContinuityClient {
 constructor(options:ClientOptions);
 readonly selectedBranch:Branch;readonly connectionFile:string;
 state():Promise<NativeRecord>;
 branches():Promise<{current:Branch;workspaces:Array<Branch&{title:string}>}>;
 openBranch(branch:Branch):Promise<NativeRecord>;
 history(options?:PageOptions):Promise<NativeRecord>;
 request(requestId:string):Promise<NativeRecord|null>;
 sourceRows(sourceId:string,options?:PageOptions):Promise<NativeRecord>;
 reportRows(reconciliationId:string,options?:PageOptions&{status?:'MATCHED'|'MISSING'|'EXTRA'|'CONFLICT'|'DUPLICATE'|'UNVERIFIED'}):Promise<NativeRecord>;
 findings(reconciliationId:string,options?:PageOptions&{severity?:'BLOCKING'|'REVIEW'}):Promise<NativeRecord>;
 pages(kind:'history'|'sourceRows'|'reportRows'|'findings',recordId?:string,options?:PageOptions&{status?:string;severity?:string}):AsyncGenerator<NativeRecord>;
 command(command:Command,expectedRevision:number):Promise<NativeRecord>;
 exportWorkspace(publicationId:string,revision:number):Promise<NativeRecord>;
 receive(input:{operationId:string;sha256:string;bytes:number;name:string}):Promise<NativeRecord>;
 uploadBytes(kind:'blob'|'archive',data:Buffer,expected:FileDescriptor):Promise<NativeRecord>;
 uploadFile(kind:'blob'|'archive',file:string,expected:FileDescriptor):Promise<NativeRecord>;
 download(selection:DownloadSelection,onChunk:(bytes:Buffer)=>void|Promise<void>):Promise<FileDescriptor&{mediaType:string}>;
 close():Promise<void>;
}
export function createPropertyContinuityClient(options:ClientOptions):PropertyContinuityClient;
