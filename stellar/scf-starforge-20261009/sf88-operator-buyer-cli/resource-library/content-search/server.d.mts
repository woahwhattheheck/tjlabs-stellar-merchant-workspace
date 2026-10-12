import type {Library} from '../library.mjs';
import type {ContentSearch} from './engine.mjs';
import type {IncomingMessage,ServerResponse,Server} from 'node:http';
export interface ExtensionContext {request:IncomingMessage;response:ServerResponse;url:URL;send(value:unknown,status?:number):void;body(maximum?:number):Promise<Record<string,unknown>>;signal:AbortSignal;registerDownload(producer:(signal:AbortSignal)=>Promise<unknown>):Promise<unknown>}
export interface ResearchExtension {additionalAssets:Array<{route:string;type:string;bytes:Buffer}>;authenticatedRoute(context:ExtensionContext):Promise<boolean>;close():Promise<void>}
export interface HostOptions {port?:number;maxBodyBytes?:number;additionalAssets?:ResearchExtension['additionalAssets'];authenticatedRoute?:ResearchExtension['authenticatedRoute']|ResearchExtension['authenticatedRoute'][]}
export function contentSearchExtension(search:ContentSearch):Promise<ResearchExtension>;
export function serveContentSearch(library:Library,options?:HostOptions):Promise<{origin:string;url:string;token:string;server:Server;search:ContentSearch;close():Promise<void>}>;
