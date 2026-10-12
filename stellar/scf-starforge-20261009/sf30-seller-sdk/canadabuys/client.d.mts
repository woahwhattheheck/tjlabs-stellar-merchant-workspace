import type { Stream, SourceInput, WorkspaceView, WorkspacePackage, SourceEdition, OriginalSource, Notice, Workshare, WorkshareHistory, WorkshareInput, WorksharePatch, ReviewPatch, Profile, ProfileMatch, Selection, Comparison, CaptureRecord, Receiving, Ingestion, ReceiveResult } from './workspace.mjs';
export interface RequestOptions { signal?:AbortSignal;timeoutMs?:number }
export interface RawResponse { mime:string;filename:string|null;body:string;bytes:number }
export interface MutationView extends WorkspaceView { workshare?:Workshare;capture?:CaptureRecord;receiving?:Receiving;ingestion?:Ingestion;alreadyReceived?:boolean;alreadyComplete?:boolean }
export type CaptureSelection={stream:Stream;expectedRevision:number;url?:string;label?:string}|{captureId:string;expectedRevision:number};
export declare class CanadaBuysClientError extends Error { code:string;status:number|null;details:unknown;constructor(message:string,options?:{code?:string;status?:number|null;details?:unknown}) }
export declare class CanadaBuysClient {
 constructor(baseUrl:string,options?:{fetch?:typeof fetch;headers?:Record<string,string>;timeoutMs?:number;maxResponseBytes?:number});
 readonly baseUrl:string;readonly timeoutMs:number;readonly maxResponseBytes:number;
 request<T=unknown>(path:string,options?:RequestOptions&{method?:string;body?:unknown;raw?:false}):Promise<T>;
 request(path:string,options:RequestOptions&{method?:string;body?:unknown;raw:true}):Promise<RawResponse>;
 workspace(options?:RequestOptions):Promise<WorkspaceView>;
 notice(id:string,options?:RequestOptions):Promise<Notice>;
 workshare(id:string,options?:RequestOptions):Promise<WorkshareHistory>;
 entry(id:string,options?:RequestOptions):Promise<SourceEdition>;
 source(id:string,options?:RequestOptions):Promise<OriginalSource>;
 captureRecord(id:string,options?:RequestOptions):Promise<CaptureRecord>;
 receiving(packageId:string,options?:RequestOptions):Promise<Receiving>;
 compare(before:string,after:string,options?:RequestOptions):Promise<Comparison>;
 importCsv(rawText:string,metadata:SourceInput&RequestOptions&{expectedRevision:number}):Promise<MutationView>;
 createWorkshare(workshare:WorkshareInput,expectedRevision:number,options?:RequestOptions):Promise<MutationView>;
 updateWorkshare(id:string,patch:WorksharePatch,options?:RequestOptions):Promise<MutationView>;
 updateReview(id:string,patch:ReviewPatch,options?:RequestOptions):Promise<MutationView>;
 qualify(profile:Profile,options?:RequestOptions):Promise<{profile:Profile;results:ProfileMatch[]}>;
 capture(selection:CaptureSelection,options?:RequestOptions):Promise<MutationView>;
 report(options?:Selection&RequestOptions&{format?:'json'|'csv'|'html'}):Promise<RawResponse>;
 exportPackage(options?:Selection&RequestOptions):Promise<WorkspacePackage>;
 receivePackage(packet:WorkspacePackage,expectedRevision:number,options?:RequestOptions):Promise<MutationView>;
}
