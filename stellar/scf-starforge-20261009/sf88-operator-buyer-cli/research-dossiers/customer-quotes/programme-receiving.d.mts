/** MIT. One retained receiving review delegates to the original case and dossier writers. */
import type {ResearchQuoteObject,ResearchQuoteOperation} from './client.mjs';
import type {ResearchQuoteProgrammeClient,ResearchQuoteProgrammeFile} from './programme.mjs';
import type {ResearchQuoteHandoverSelection} from './programme-files.mjs';
export interface ResearchQuoteProgrammeReceivingInput {
 schema:'sf88-research-quotation-programme-receiving/v1';requestId:string;
 expectedWorkspaceId:string;expectedCasesWorkspaceId:string;
 /** null selects a new local case; otherwise this is the current original destination revision. */
 expectedRevision:string|null;
 /** Required for an included original Europe PMC source workspace. */
 sourceActor:string|null;
}
export interface ResearchQuoteProgrammeReceivingRequest {
 schema:'sf88-research-quotation-programme-receiving-request/v1';input:ResearchQuoteProgrammeReceivingInput;
 requestSha256:string;source:ResearchQuoteHandoverSelection;sourceSha256:string;manifestSha256:string;
 inputFile:ResearchQuoteProgrammeFile;createdAt:string;
}
export interface ResearchQuoteProgrammeReceivingReview {
 schema:'sf88-research-quotation-programme-receiving-review/v1';requestSha256:string;manifestSha256:string;
 source:ResearchQuoteHandoverSelection;workspaceId:string;casesWorkspaceId:string;
 caseTransfer:{id:string;reviewSha256:string;operation:ResearchQuoteOperation};
 customer:ResearchQuoteHandoverSelection['customer'];sourceActor:string|null;createdAt:string;reviewSha256:string;
}
export interface ResearchQuoteProgrammeReceived {
 schema:'sf88-research-quotation-programme-received/v1';requestSha256:string;manifestSha256:string;
 reviewSha256:string;workspaceId:string;casesWorkspaceId:string;source:ResearchQuoteHandoverSelection;
 destination:{workspaceId:string;casesWorkspaceId:string;caseId:string;caseRevision:string;
  dossierId:string;projectId:string;deliveryId:string;revision:number};
 case:ResearchQuoteObject;caseTransfer:ResearchQuoteOperation;customer:ResearchQuoteObject;completedAt:string;
}
export interface ResearchQuoteProgrammeReceivingState {
 schema:'sf88-research-quotation-programme-receiving/v1';directory:string;
 status:'PREPARING'|'REVIEWED'|'COMPLETE';request:ResearchQuoteProgrammeReceivingRequest;
 review:ResearchQuoteProgrammeReceivingReview|null;result:ResearchQuoteProgrammeReceived|null;
 source:{directory:string;manifestSha256:string;manifestBytes:number;selection:ResearchQuoteHandoverSelection;
  files:Array<ResearchQuoteProgrammeFile&{path:string}>};
}
export declare const RESEARCH_QUOTE_PROGRAMME_RECEIVING:'sf88-research-quotation-programme-receiving/v1';
export declare function researchQuoteProgrammeReceivingInput(value:unknown):ResearchQuoteProgrammeReceivingInput;
export declare function prepareResearchQuoteProgrammeReceiving(input:{
 client?:ResearchQuoteProgrammeClient;directory:string;sourceDirectory?:string;input?:ResearchQuoteProgrammeReceivingInput;
 inputFile?:string;manifestSha256?:string;signal?:AbortSignal;
}):Promise<ResearchQuoteProgrammeReceivingState&{reused:boolean}>;
export declare function receiveResearchQuoteProgramme(input:{
 client?:ResearchQuoteProgrammeClient;directory:string;reviewSha256:string;signal?:AbortSignal;
}):Promise<ResearchQuoteProgrammeReceived&{directory:string;sourceDirectory:string;reused:boolean}>;
export declare function readResearchQuoteProgrammeReceiving(directory:string):Promise<ResearchQuoteProgrammeReceivingState>;
