/** MIT. Whole programme jobs and file transfer over the original admitted Research connection. */
import type {ResearchQuoteObject,ResearchQuoteCaseAction,ResearchQuotePricingAction} from './client.mjs';
import type {ResearchQuoteProgrammeCommand,ResearchQuoteProgrammeInput,ResearchQuoteProgrammeFile,
 ResearchQuoteProgrammeStep,ResearchQuoteProgrammeState} from './programme.mjs';
import type {ResearchQuoteHandover,ResearchQuoteHandoverInput,ResearchQuoteHandoverSelection} from './programme-files.mjs';
import type {ResearchQuoteProgrammeReceivingInput,ResearchQuoteProgrammeReceivingState} from './programme-receiving.mjs';

export interface ResearchProgrammeOptions {signal?:AbortSignal}
export interface ResearchProgrammeDownloadOptions extends ResearchProgrammeOptions {
 file:string;expectedSha256?:string;expectedBytes?:number;
}
export type ResearchProgrammeJobKind='CREATE'|'SUBMIT'|'APPLY'|'REPLAY'|'EXPORT'|'IMPORT'|'ARCHIVE'|'RECEIVE_REVIEW'|'RECEIVE';
export type ResearchProgrammeJobInput=
 {id:string;kind:'CREATE';value:ResearchQuoteProgrammeInput}|
 {id:string;kind:'SUBMIT';programmeId:string;stepId:string;command:ResearchQuoteProgrammeCommand;
  value:ResearchQuoteObject;action?:ResearchQuoteCaseAction|ResearchQuotePricingAction;profile?:string}|
 {id:string;kind:'APPLY';programmeId:string;sourceStepId:string;stepId:string;reviewSha256:string}|
 {id:string;kind:'REPLAY';programmeId:string;sourceStepId:string;stepId:string}|
 {id:string;kind:'EXPORT';programmeId:string;value:Omit<ResearchQuoteHandoverInput,'programmeDirectory'>}|
 {id:string;kind:'IMPORT';uploadId:string;manifestSha256?:string}|
 {id:string;kind:'ARCHIVE';bundleId:string;manifestSha256:string}|
 {id:string;kind:'RECEIVE_REVIEW';bundleId:string;manifestSha256:string;value:ResearchQuoteProgrammeReceivingInput}|
 {id:string;kind:'RECEIVE';receivingId:string;reviewSha256:string};
export interface ResearchProgrammeDescriptor extends ResearchQuoteProgrammeFile {
 path?:string;maximum?:number;manifestSha256?:string;
}
export interface ResearchProgrammeError {code:string;message:string;outcomeUnknown:boolean;requestState?:string}
export interface ResearchProgrammeSummary {
 id:string;kind:ResearchProgrammeJobKind;programmeId:string|null;programmeName:string|null;stepId:string|null;
 status:string|null;nativeState:string|null;requestId:string|null;reviewSha256:string|null;
 next:ResearchQuoteProgrammeStep['summary']['next'];manifestSha256:string|null;files:number|null;
 caseId:string|null;dossierId:string|null;destination:ResearchQuoteObject|null;resultSha256:string;completedAt:string;
}
export interface ResearchProgrammeJob {
 schema:'sf88-research-quotation-programme-desk/v1';workspaceId:string;id:string;
 /** Compact route and full-input identity. The complete source is job-input.json. */
 request:ResearchQuoteObject&{id:string;kind:ResearchProgrammeJobKind};
 requestSha256:string;createdAt:string;status:'READY'|'RUNNING'|'RETRY_REQUIRED'|'COMPLETE';
 error:ResearchProgrammeError|null;attempts:number;summary:ResearchProgrammeSummary|null;
 resultFile:ResearchProgrammeDescriptor|null;inputFile:ResearchProgrammeDescriptor;
 /** Included only with result:true on a completed job. */
 result?:ResearchQuoteObject;
}
export interface ResearchProgrammeJobRow {
 id:string;kind:ResearchProgrammeJobKind;status:ResearchProgrammeJob['status'];createdAt:string;requestSha256:string;
 summary:ResearchProgrammeSummary|null;error:ResearchProgrammeError|null;programmeId:string|null;
}
export interface ResearchProgrammePage<T> {
 schema:'sf88-research-quotation-programme-desk/v1';workspaceId:string;items:T[];
 offset:number;limit:number;total:number;snapshot:string;nextOffset:number|null;
}
export interface ResearchProgrammePaging {offset?:number;limit?:number;snapshot?:string}
export interface ResearchProgrammeInfo {
 schema:'sf88-research-quotation-programme-desk/v1';workspaceId:string;directory:string;
 uploadChunkBytes:number;inputLimit:number;caseInputLimit:number;fileLimit:number;
 capabilities:{jobs:true;programmes:true;originalQuotationForms:true;archives:true;receiving:true};
 configuration:ResearchQuoteObject;
}
export type ResearchProgrammeStep=Omit<ResearchQuoteProgrammeStep,'input'>&{inputFile:ResearchProgrammeDescriptor};
export type ResearchProgrammeBundle=Omit<ResearchQuoteHandover,'caseRecord'|'operations'>&{
 caseRecordFile:ResearchProgrammeDescriptor;
 operations:Array<ResearchQuoteHandoverSelection['operations'][number]&{
  directory:string;files:ResearchQuoteObject[];operationFile:ResearchProgrammeDescriptor;
 }>;
};
export interface ResearchProgrammeFiles extends ResearchProgrammePage<ResearchProgrammeDescriptor> {
 id:string;manifestSha256:string;selection:ResearchQuoteHandoverSelection;
}
export interface ResearchProgrammeFileInfo {
 schema:'sf88-research-quotation-programme-desk/v1';workspaceId:string;id:string;descriptor:ResearchProgrammeDescriptor;
}
export interface ResearchProgrammeArchive {
 schema:'sf88-research-quotation-programme-desk/v1';workspaceId:string;id:string;
 directory:string;path:string;bytes:number;sha256:string;manifestSha256:string;manifestBytes:number;
 selection:ResearchQuoteHandoverSelection;reused:boolean;name:string;
}
export interface ResearchProgrammeUploadInput {id:string;name:string;bytes:number;sha256:string}
export interface ResearchProgrammeUpload {
 id:string;name:string;totalBytes:number;receivedBytes:number;chunkBytes:number;
 state:'UPLOADING'|'READY_TO_FINISH'|'COMPLETE';
 pendingChunk:null|{offset:number;bytes:number;sha256:string};
 /** Only exposed after complete native input verification. */
 path?:string;bytes?:number;sha256?:string;
}
export interface ResearchProgrammeSavedFile {
 path:string;bytes:number;sha256:string;filename?:string;contentType?:string;
}
export interface ResearchProgrammeDownload extends ResearchProgrammeSavedFile {
 metadata:ResearchProgrammeFileInfo|ResearchProgrammeArchive;
}
export interface ResearchProgrammeRange extends ResearchProgrammeOptions {
 offset:number;limit:number;bytes:number;sha256:string;
}
export interface ResearchQuoteProgrammesClient {
 /** Admit one complete SDK continuation. Every inner call drains before return; the view cannot escape its callback. */
 withWork<T>(callback:(admitted:ResearchQuoteProgrammesClient)=>Promise<T>):Promise<T>;
 readArchiveRange(id:string,selection:ResearchProgrammeRange):Promise<Buffer>;
 info(options?:ResearchProgrammeOptions):Promise<ResearchProgrammeInfo>;
 jobs(input?:ResearchProgrammePaging&{kind?:ResearchProgrammeJobKind},options?:ResearchProgrammeOptions):Promise<ResearchProgrammePage<ResearchProgrammeJobRow>>;
 job(id:string,options?:ResearchProgrammeOptions&{result?:boolean}):Promise<ResearchProgrammeJob>;
 /** Retains the full input and returns its asynchronous native job. */
 submit(input:ResearchProgrammeJobInput,options?:ResearchProgrammeOptions):Promise<ResearchProgrammeJob>;
 resume(id:string,options?:ResearchProgrammeOptions):Promise<ResearchProgrammeJob>;
 programme(id:string,options?:ResearchProgrammeOptions):Promise<ResearchQuoteProgrammeState>;
 step(programmeId:string,stepId:string,options?:ResearchProgrammeOptions):Promise<ResearchProgrammeStep>;
 receiving(id:string,options?:ResearchProgrammeOptions):Promise<ResearchQuoteProgrammeReceivingState>;
 bundle(id:string,options?:ResearchProgrammeOptions&{manifestSha256?:string}):Promise<ResearchProgrammeBundle>;
 files(id:string,input?:ResearchProgrammePaging,options?:ResearchProgrammeOptions):Promise<ResearchProgrammeFiles>;
 fileInfo(id:string,name:string,options?:ResearchProgrammeOptions):Promise<ResearchProgrammeFileInfo>;
 jobFileInfo(id:string,name:'job-input.json'|'request.json'|'result.json',options?:ResearchProgrammeOptions):Promise<ResearchProgrammeFileInfo>;
 download(id:string,name:string,options:ResearchProgrammeDownloadOptions):Promise<ResearchProgrammeDownload>;
 downloadJobFile(id:string,name:'job-input.json'|'request.json'|'result.json',options:ResearchProgrammeDownloadOptions):Promise<ResearchProgrammeDownload>;
 archive(id:string,options?:ResearchProgrammeOptions):Promise<ResearchProgrammeArchive>;
 downloadArchive(id:string,options:ResearchProgrammeDownloadOptions):Promise<ResearchProgrammeDownload>;
 startUpload(input:ResearchProgrammeUploadInput,options?:ResearchProgrammeOptions):Promise<ResearchProgrammeUpload>;
 upload(id:string,options?:ResearchProgrammeOptions):Promise<ResearchProgrammeUpload>;
 appendUpload(id:string,input:ResearchProgrammeOptions&{offset:number;data:Uint8Array;sha256:string}):Promise<ResearchProgrammeUpload>;
 finishUpload(id:string,options?:ResearchProgrammeOptions):Promise<ResearchProgrammeUpload>;
}
/** Factory methods use one run admission for every complete metadata/download operation.
 * request, download, upload and range are the original owner's admitted transport callbacks.
 * The returned client borrows its host and exposes no independent close operation.
 */
export declare function createResearchQuoteProgrammesClient(input:{
 run:<T>(work:()=>Promise<T>)=>Promise<T>;
 request:(route:string,body:unknown|undefined,options?:ResearchProgrammeOptions)=>Promise<any>;
 download:(route:string,file:string,options?:ResearchProgrammeOptions&{expectedSha256?:string})=>Promise<ResearchProgrammeSavedFile>;
 upload:(route:string,body:Uint8Array,options?:ResearchProgrammeOptions)=>Promise<ResearchProgrammeUpload>;
 /** Verifies exact 206 range, total, length, ETag, archive SHA and complete chunk SHA before returning. */
 range?:(route:string,selection:ResearchProgrammeRange)=>Promise<Uint8Array>;
}):ResearchQuoteProgrammesClient;
