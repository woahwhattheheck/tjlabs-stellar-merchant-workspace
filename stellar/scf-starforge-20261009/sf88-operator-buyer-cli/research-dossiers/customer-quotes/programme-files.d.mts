/** MIT. Whole native quotation and customer-file handovers. */
import type {ResearchQuoteObject,ResearchQuoteKind,ResearchQuoteOperation} from './client.mjs';
import type {ResearchQuoteProgrammeClient,ResearchQuoteProgrammeState,ResearchQuoteProgrammeFile} from './programme.mjs';
export interface ResearchQuoteHandoverInput {
 schema:'sf88-research-quotation-handover-request/v1';requestId:string;programmeDirectory:string;
 caseRevision:string;deliveryId:string;revision:number;
 sourceWorkspace:null|{library:string;actor:string;requestId:string};
 /** null selects every retained completed step at the first capture. */
 stepIds:null|string[];
}
export interface ResearchQuoteHandoverOperation {
 id:string;kind:ResearchQuoteKind;status:'PREPARING'|'REVIEWED'|'COMPLETE';requestSha256:string;
 operationSha256:string;publicationId:string|null;name:string;
}
export interface ResearchQuoteHandoverSelection {
 programmeId:string;programmeSha256:string;workspaceId:string;casesWorkspaceId:string;caseId:string;caseRevision:string;
 dossierId:string;projectId:string;deliveryId:string;revision:number;stepIds:string[];
 operations:ResearchQuoteHandoverOperation[];
 publications:Array<{id:string;name:string;files:Array<ResearchQuoteProgrammeFile&{part:'publication'|'handoff'|'archive'}>}>;
 caseRecord:ResearchQuoteProgrammeFile;
 customer:{name:string;manifestSha256:string;manifestBytes:number;selection:ResearchQuoteObject};
}
export interface ResearchQuoteHandoverManifest {
 schema:'sf88-research-quotation-handover/v1';request:ResearchQuoteHandoverInput;requestSha256:string;
 selection:ResearchQuoteHandoverSelection;createdAt:string;files:ResearchQuoteProgrammeFile[];
}
export interface ResearchQuoteHandover {
 schema:'sf88-research-quotation-handover-inspected/v1';directory:string;manifestSha256:string;manifestBytes:number;
 manifest:ResearchQuoteHandoverManifest;selection:ResearchQuoteHandoverSelection;
 files:Array<ResearchQuoteProgrammeFile&{path:string}>;programme:ResearchQuoteProgrammeState;
 caseRecord:ResearchQuoteObject;caseInspection:ResearchQuoteObject;customer:ResearchQuoteObject;
 operations:Array<{id:string;operation:ResearchQuoteOperation;directory:string;files:ResearchQuoteObject[]}>;
}
export declare const RESEARCH_QUOTE_HANDOVER_SCHEMA:'sf88-research-quotation-handover/v1';
export declare const RESEARCH_QUOTE_HANDOVER_REQUEST:'sf88-research-quotation-handover-request/v1';
export declare function researchQuoteHandoverPath(name:string):string;
export declare function researchQuoteHandoverInput(value:unknown):ResearchQuoteHandoverInput;
export declare function researchQuoteDistinctDirectories(first:string,second:string):void;
export declare function createResearchQuoteHandover(input:{
 client?:ResearchQuoteProgrammeClient;directory:string;input?:ResearchQuoteHandoverInput;inputFile?:string;signal?:AbortSignal;
}):Promise<ResearchQuoteHandover&{operationDirectory:string;reused:boolean}>;
export declare function inspectResearchQuoteHandover(directory:string,input?:{manifestSha256?:string}):Promise<ResearchQuoteHandover>;
export declare function copyResearchQuoteHandover(input:{
 sourceDirectory?:string;directory:string;manifestSha256?:string;
}):Promise<ResearchQuoteHandover&{reused:boolean}>;
