/** MIT. Exact local/remote archive transfer into the original programme uploader. */
import type {ResearchQuoteProgrammesClient,ResearchProgrammeArchive,ResearchProgrammeUpload}
 from './programme-client.mjs';
export declare const RESEARCH_QUOTE_PROGRAMME_TRANSFER_SCHEMA:'sf88-research-quotation-programme-transfer/v1';
export type ResearchProgrammeCompleteUpload=ResearchProgrammeUpload&{
 state:'COMPLETE';pendingChunk:null;path:string;bytes:number;sha256:string;
};
export interface ResearchProgrammeTransferDestination {
 workspaceId:string;uploadId:string;upload:ResearchProgrammeCompleteUpload;
}
export interface ResearchProgrammeFileTransfer {
 schema:'sf88-research-quotation-programme-transfer/v1';
 source:{kind:'FILE';path:string;bytes:number;sha256:string};
 destination:ResearchProgrammeTransferDestination;
 /** True when the original selected destination upload was already COMPLETE. */
 reused:boolean;
}
export interface ResearchProgrammeArchiveTransfer {
 schema:'sf88-research-quotation-programme-transfer/v1';
 source:{kind:'ARCHIVE';workspaceId:string;archiveId:string;archive:ResearchProgrammeArchive};
 destination:ResearchProgrammeTransferDestination;reused:boolean;
}
export interface ResearchProgrammeUploadFileSelection {
 /** Absolute original file selection. An already complete target reopens before this donor. */
 path:string;uploadId:string;bytes:number;sha256:string;signal?:AbortSignal;
}
export interface ResearchProgrammeTransferSelection {
 archiveId:string;uploadId:string;bytes:number;sha256:string;manifestSha256:string;signal?:AbortSignal;
}
/** Owns accepted transfers and local descriptors only. Borrowed clients/hosts are never closed.
 * Both remote clients are admitted synchronously before any network work.
 * Pending upload chunks reuse their exact retained offsets, lengths and hashes.
 * A COMPLETE upload is subsequently used by the existing IMPORT/RECEIVE_REVIEW/RECEIVE jobs.
 */
export declare class ResearchQuoteProgrammeTransfers {
 constructor();
 uploadFile(destination:ResearchQuoteProgrammesClient,input:ResearchProgrammeUploadFileSelection):Promise<ResearchProgrammeFileTransfer>;
 transferTo(source:ResearchQuoteProgrammesClient,destination:ResearchQuoteProgrammesClient,
  input:ResearchProgrammeTransferSelection):Promise<ResearchProgrammeArchiveTransfer>;
 /** Denies new work, drains accepted work, and retries only still-owned original handles. */
 close():Promise<void>;
}
