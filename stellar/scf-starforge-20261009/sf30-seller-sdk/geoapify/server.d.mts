export type GeoapifyJobStatus='PREPARED'|'SENDING'|'UNCERTAIN'|'PENDING'|'POLLING'|'COMPLETE'|'PARTIAL'|'REJECTED'|'EXPIRED'|'ABANDONED';
export interface RetainedFile {file:string;bytes:number;sha256:string}
export interface GeoapifyMapping {text?:string;name?:string;housenumber?:string;street?:string;postcode?:string;city?:string;state?:string;country?:string;identity?:string;latitude?:string;longitude?:string}
export interface GeoapifyBatchOptions {limit?:number;lang?:string;filter?:string;bias?:string;type?:'country'|'state'|'city'|'postcode'|'street'|'amenity'|'locality';priority?:number;endpoint?:'https://api.geoapify.com/v1/batch'|'https://api-eu.geoapify.com/v1/batch'}
export interface GeoapifyJob {id:string;status:GeoapifyJobStatus;queryCount:number;request:RetainedFile;providerBodySha256:string;providerBodyBytes:number;jobId:string|null;events:unknown[];nextPollAt:string|null}
export interface GeoapifyState {schema:'stellar-forge.geoapify-workspace.v1';id:string;directory:string;revision:number;intake:RetainedFile|null;jobs:GeoapifyJob[];editions:unknown[];activeEditionId:string|null;exports:unknown[];editor:Record<string,unknown>|null;api:{configured:boolean;maximumBatch:1000;minimumPollMs:60000;retentionHours:24};[key:string]:unknown}
export interface GeoapifyOperator {
 state():Promise<GeoapifyState>;
 act(action:string,payload?:Record<string,unknown>):Promise<{result:unknown;state:GeoapifyState}>;
 readExport(exportId:string,filename:string):Promise<{path:string;bytes:number;sha256:string;contentType:string}>;
 readPublisherExport(kind:string,id:string):Promise<{bytes:Uint8Array;filename:string;contentType:string}>;
 close():Promise<void>;
}
export interface GeoapifyOperatorOptions {directory:string;apiKey?:string;timeoutMs?:number;fetcher?:typeof fetch;workspace?:Omit<GeoapifyOperator,'readPublisherExport'>;publisher?:unknown;facilitators?:unknown}
export const GEOAPIFY_ACTIONS:Set<string>;
export function openGeoapifyOperator(options:GeoapifyOperatorOptions):Promise<GeoapifyOperator>;
export function startGeoapifyWorkspace(options:GeoapifyOperatorOptions & {port?:number;operator?:GeoapifyOperator}):Promise<{origin:string;url:string;token:string;workspace:GeoapifyOperator;close():Promise<void>}>;
