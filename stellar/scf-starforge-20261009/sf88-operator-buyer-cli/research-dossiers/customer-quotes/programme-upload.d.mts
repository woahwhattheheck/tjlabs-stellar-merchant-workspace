/** MIT. One original chunked quotation-programme upload and its retained completion. */
export declare const RESEARCH_QUOTE_PROGRAMME_UPLOAD_CHUNK:4194304;
export declare const RESEARCH_QUOTE_PROGRAMME_UPLOAD_SCHEMA:'sf88-research-quotation-programme-upload/v1';
export interface ResearchQuoteProgrammeUploadInput {
 /** Original UUID, retained across reconnects and retries. */
 id:string;name:string;bytes:number;sha256:string;
}
export interface ResearchQuoteProgrammePendingChunk {offset:number;bytes:number;sha256:string}
export interface ResearchQuoteProgrammeUploadProgress {
 id:string;name:string;totalBytes:number;receivedBytes:number;chunkBytes:4194304;
 pendingChunk:ResearchQuoteProgrammePendingChunk|null;
}
export type ResearchQuoteProgrammeUpload =
 | (ResearchQuoteProgrammeUploadProgress&{state:'UPLOADING'|'READY_TO_FINISH'})
 | (ResearchQuoteProgrammeUploadProgress&{
  state:'COMPLETE';pendingChunk:null;path:string;bytes:number;sha256:string;
 });
export declare function startResearchQuoteProgrammeUpload(input:{
 directory:string;input:ResearchQuoteProgrammeUploadInput;
}):Promise<ResearchQuoteProgrammeUpload>;
export declare function inspectResearchQuoteProgrammeUpload(directory:string):Promise<ResearchQuoteProgrammeUpload>;
export declare function appendResearchQuoteProgrammeUpload(input:{
 directory:string;offset:number;data:Uint8Array;sha256:string;
}):Promise<ResearchQuoteProgrammeUpload>;
export declare function finishResearchQuoteProgrammeUpload(input:{directory:string}):Promise<ResearchQuoteProgrammeUpload>;
