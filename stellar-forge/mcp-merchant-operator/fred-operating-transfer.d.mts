/// <reference types="node" />
export const FRED_OPERATING_ARCHIVE_MAX_BYTES:number;
export interface FredOperatingOpenArchive {
 archivePath:string;bytes:number;sha256:string;body():AsyncGenerator<Buffer>;close():Promise<void>;
}
export function openFredOperatingArchiveFile(path:string,options?:{expectedSha256?:string;signal?:AbortSignal}):Promise<FredOperatingOpenArchive>;
export function inspectFredOperatingArchiveFile(path:string,options?:{expectedSha256?:string;signal?:AbortSignal}):Promise<{archivePath:string;bytes:number;sha256:string}>;
export function saveFredOperatingArchiveResponse(response:Response,destination:string,archive:{bytes:number;sha256:string},options?:{signal?:AbortSignal}):
 Promise<{destination:string;bytes:number;sha256:string;reused:boolean}>;
