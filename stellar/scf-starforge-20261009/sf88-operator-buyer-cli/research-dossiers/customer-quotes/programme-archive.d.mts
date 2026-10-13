/** MIT. Complete native quotation programme stream and retained file ownership. */
import type {BigIntStats} from 'node:fs';
import type {FileHandle} from 'node:fs/promises';
import type {ResearchQuoteHandover,ResearchQuoteHandoverSelection} from './programme-files.mjs';
export declare const RESEARCH_QUOTE_PROGRAMME_ARCHIVE_SCHEMA:'sf88-research-quotation-programme-archive/v1';
/** Conservative complete gzip bound derived from all 40,000 original maximum-size members. No such buffer is allocated. */
export declare const RESEARCH_QUOTE_PROGRAMME_ARCHIVE_LIMIT:number;
export interface ResearchQuoteProgrammeArchiveFile {path:string;bytes:number;sha256:string}
export interface ResearchQuoteProgrammeArchive extends ResearchQuoteProgrammeArchiveFile {
 directory:string;manifestSha256:string;manifestBytes:number;selection:ResearchQuoteHandoverSelection;reused:boolean;
}
export interface ResearchQuoteProgrammeArchiveReceived extends ResearchQuoteHandover {
 archive:ResearchQuoteProgrammeArchiveFile;
 /** The complete inspected handover is in operationDirectory + '/package'. */
 operationDirectory:string;reused:boolean;
}
export interface ResearchQuoteProgrammeFileIdentity {
 device:string;inode:string;bytes:number;mtimeNs:string;ctimeNs:string;
}
export interface ResearchQuoteProgrammeHeldFile {
 path:string;handle:FileHandle;bytes:number;identity:ResearchQuoteProgrammeFileIdentity;
 /** Default checks the complete size/time identity for readers; writable internal handles allow growth. */
 assertHeld(options?:{stable?:boolean}):Promise<BigIntStats>;
 /** Idempotent on success; a failed original closer remains retryable. */
 close():Promise<void>;
}
export interface ResearchQuoteProgrammeHeldArchive extends ResearchQuoteProgrammeHeldFile {sha256:string}
export declare function createResearchQuoteProgrammeArchive(input:{
 directory:string;
 /** Needed for a first export or incomplete prefix. Completed original stream receipts reopen before donor access. */
 sourceDirectory?:string;manifestSha256?:string;
}):Promise<ResearchQuoteProgrammeArchive>;
export declare function receiveResearchQuoteProgrammeArchive(input:{
 directory:string;
 /** Required until this same directory retains its complete original compressed input. */
 path?:string;bytes?:number;sha256?:string;
}):Promise<ResearchQuoteProgrammeArchiveReceived>;
export declare function openResearchQuoteProgrammeArchive(input:{
 path:string;bytes?:number;sha256?:string;
}):Promise<ResearchQuoteProgrammeHeldArchive>;
/** Native transport implementation helpers; not additional business receiving operations. */
export declare function _programmeHash(value:unknown):string;
export declare function _programmeCount(value:unknown,maximum?:number,minimum?:number):number;
export declare function _programmeSame(a:unknown,b:unknown):boolean;
export declare function _programmeAbsolute(value:unknown):string;
export declare function _programmeIdentity(stat:BigIntStats):ResearchQuoteProgrammeFileIdentity;
export declare function _programmeUsing<T>(held:ResearchQuoteProgrammeHeldFile,
 work:(held:ResearchQuoteProgrammeHeldFile)=>Promise<T>):Promise<T>;
export declare function _programmeSyncClose(handle:FileHandle):Promise<void>;
export declare function _programmeOpen(path:string,options?:{writable?:boolean;expectedBytes?:number}):Promise<ResearchQuoteProgrammeHeldFile>;
export declare function _programmeRead(held:ResearchQuoteProgrammeHeldFile,offset:number,length:number):Promise<Buffer>;
export declare function _programmeWrite(handle:FileHandle,buffer:Buffer,offset:number):Promise<void>;
export declare function _programmeStream(held:ResearchQuoteProgrammeHeldFile,options?:{sha256?:string}):AsyncGenerator<Buffer>;
export declare function _programmeFileHash(held:ResearchQuoteProgrammeHeldFile):Promise<string>;
export declare function _programmeReadJson(root:string,name:string,optional?:boolean,limit?:number):Promise<unknown>;
export declare function _programmeInitial(root:string,marker:string,value:unknown):Promise<void>;
