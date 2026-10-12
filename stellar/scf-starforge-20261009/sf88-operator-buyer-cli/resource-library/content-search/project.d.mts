import type {FileHandle} from 'node:fs/promises';
import type {ContentSearch} from './engine.mjs';
import {ResearchClient} from './client.mjs';
import type {RequestOptions,DownloadTicket} from './client.mjs';
export interface ProjectOptions extends RequestOptions {
 python?:string;maximumBytes?:number;
 onProgress?:(value:{state:'COPYING_ORIGINALS';completed:number;total:number;bytes:number})=>void;
}
export interface ProjectArchive {
 path?:string;bytes:number;sha256:string;projectId:string;members:number;resources:number;
 originals:number;originalBytes:number;handovers:{operations:number;files:number};
}
export interface ProjectInspection {
 schema:'stellar-forge.resource-research-project.v1';projectId:string;members:number;
 bytes:number;resources:number;path?:string;
}
export interface ProjectDownload {
 file:FileHandle;bytes:number;sha256:string;resource:{id:string;name:string};
 project:ProjectArchive;dispose():Promise<void>;
}
export function projectCommand(command:string,args:string[],options?:ProjectOptions):Promise<unknown>;
export function projectDownload(search:ContentSearch,options?:ProjectOptions,signal?:AbortSignal):Promise<ProjectDownload>;
export function saveProject(search:ContentSearch,destination:string,options?:ProjectOptions):Promise<ProjectArchive>;
export function inspectProject(archive:string,options?:ProjectOptions):Promise<ProjectInspection>;
export function receiveProject(archive:string,destination:string,options?:ProjectOptions):Promise<ProjectInspection>;
export class ResearchProjectClient extends ResearchClient {
 project(options?:RequestOptions):Promise<DownloadTicket>;
}
