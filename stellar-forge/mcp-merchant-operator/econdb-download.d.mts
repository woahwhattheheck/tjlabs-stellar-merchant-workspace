export type EcondbAlias=string;
export type EcondbWorkspaceBinding={workspace:EcondbAlias;workspaceId:string};
export type EcondbToolClient={endpoint:string;call(name:string,args:Record<string,unknown>,options?:Record<string,unknown>):Promise<any>};
export type EcondbDownloadOptions=EcondbWorkspaceBinding&{
 url?:string;client?:EcondbToolClient;exportId:string;directory:string;expectedManifestSha256?:string;
 tokenEnv?:string;environment?:Record<string,string|undefined>;signal?:AbortSignal;chunkSize?:number;
 onProgress?:(value:unknown)=>void;
};
export type EcondbHandover={schema:'stellar-forge.econdb-handover.v1';exportId:string;workspaceId:string;revision:number;transferSha256:string;files:{name:string;bytes:number;sha256:string}[]};
export function parseEcondbHandover(bytes:Uint8Array,exportId:string):EcondbHandover;
export function inspectEcondbHandover(options:Omit<EcondbDownloadOptions,'directory'>):Promise<{manifest:EcondbHandover;manifestSha256:string}>;
export function downloadEcondbHandover(options:EcondbDownloadOptions):Promise<{schema:string;state:'COMPLETE';directory:string;exportId:string;workspaceId:string;revision:number;manifestSha256:string;files:number;bytes:number;resumed:boolean;resumedBytes:number}>;
export function receiveEcondbHandover(options:{directory:string;destination:string}):Promise<{directory:string;status:unknown;resumed:boolean}>;
