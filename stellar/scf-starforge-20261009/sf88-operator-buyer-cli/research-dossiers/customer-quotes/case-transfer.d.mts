// MIT. Complete original native case edition and receiving request contracts.
import type {ResearchCaseTransferPacket,ResearchCaseTransferInput,ResearchCaseTransferSelection,
 ResearchQuoteObject,ResearchQuoteCaseIdentity} from './client.mjs';
export declare const RESEARCH_CASE_TRANSFER_SCHEMA:'sf88-research-case-transfer/v1';
export declare function caseTransferInput(value:unknown):ResearchCaseTransferInput;
export declare function caseTransferSelection(value:ResearchCaseTransferInput):ResearchCaseTransferSelection;
export declare function validateCaseTransferSelection(value:unknown):ResearchCaseTransferSelection;
export declare function inspectResearchCaseTransfer(value:unknown):Promise<ResearchCaseTransferPacket>;
export declare function exportResearchCaseTransfer(record:ResearchQuoteObject,
 source:{workspaceId:string;casesWorkspaceId:string}):Promise<ResearchCaseTransferPacket>;
export interface ResearchCaseTransferCandidate {
 workspaceText:string;supportText:string|null;metadata:ResearchQuoteObject;
 workspaceSha256:string;supportSha256:string|null;name:string;sources:ResearchQuoteObject;
 commissioningChanged:boolean;serviceChanged:boolean;
}
export declare function previewResearchCaseTransfer(packet:ResearchCaseTransferPacket,
 current?:ResearchQuoteObject|null):Promise<ResearchCaseTransferCandidate>;
export declare function researchCaseIdentity(record:ResearchQuoteObject):ResearchQuoteCaseIdentity;
export interface ResearchCaseTransferStore {
 read(id:string,revision?:string|null):Promise<ResearchQuoteObject>;
 history(id:string,query:{before?:string|null;limit:number}):Promise<{
  revisions:Array<{revision:string;previousRevision:string|null}>;nextBefore:string|null;
 }>;
}
export declare function readResearchTransferTarget(store:ResearchCaseTransferStore,caseId:string):Promise<ResearchQuoteObject|null>;
export declare function assertResearchTransferRevision(record:ResearchQuoteObject|null,expectedRevision:string|null):void;
export declare function findResearchCaseTransfer(store:ResearchCaseTransferStore,selection:{
 caseId:string;expectedRevision:string|null;workspaceSha256:string;supportSha256:string|null;metadata:ResearchQuoteObject;
}):Promise<ResearchQuoteCaseIdentity|null>;
