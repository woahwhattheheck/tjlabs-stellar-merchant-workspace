/** MIT. Retained quotation programmes use the existing native Research client. */
import type {ResearchWorkspaceClient} from '../workspace-client.mjs';
import type {ResearchQuoteObject,ResearchQuoteKind,ResearchQuoteOperation,ResearchQuoteNativeResponse,
 ResearchQuoteCaseSelection,ResearchQuoteBriefSelection,ResearchQuoteResponseSelection,
 ResearchQuotePublicationSelection,ResearchQuoteReportSelection,ResearchQuoteApplySelection,
 ResearchQuoteCaseAction,ResearchQuotePricingAction} from './client.mjs';

export type ResearchQuoteProgrammeClient=ResearchWorkspaceClient|(()=>ResearchWorkspaceClient|Promise<ResearchWorkspaceClient>);
export type ResearchQuoteProgrammeCommand='create-case'|'native-case'|'pricing'|'prepare'|'apply'|
 'prepare-response'|'prepare-publication'|'enroll-publication'|'prepare-report'|'prepare-case-transfer'|'apply-case-transfer';
export interface ResearchQuoteProgrammeInput {
 schema:'sf88-research-quotation-programme/v1';id:string;name:string;dossierId:string;revision:number;
 projectId:string;caseId:string;caseMode:'CREATE'|'EXISTING';
}
export interface ResearchQuoteProgrammeFile {name:string;bytes:number;sha256:string}
export interface ResearchQuoteProgrammeHeader {
 schema:'sf88-research-quotation-programme-retained/v1';input:ResearchQuoteProgrammeInput;
 inputSha256:string;workspaceId:string;casesWorkspaceId:string;source:ResearchQuoteObject;sourceSha256:string;
 inputFile:ResearchQuoteProgrammeFile;createdAt:string;
}
export type ResearchQuoteProgrammeSelection=
 {command:'create-case';input:ResearchQuoteCaseSelection}|
 {command:'prepare';input:ResearchQuoteBriefSelection}|
 {command:'apply'|'enroll-publication'|'apply-case-transfer';input:ResearchQuoteApplySelection}|
 {command:'prepare-case-transfer';input:{requestId:string;caseId:string;expectedRevision:string|null;source:ResearchQuoteObject}}|
 {command:'prepare-response';input:ResearchQuoteResponseSelection}|
 {command:'prepare-publication';input:ResearchQuotePublicationSelection}|
 {command:'prepare-report';input:ResearchQuoteReportSelection}|
 {command:'native-case';caseId:string;action:ResearchQuoteCaseAction;input:ResearchQuoteObject}|
 {command:'pricing';profile:string;action:ResearchQuotePricingAction;input:ResearchQuoteObject};
export interface ResearchQuoteProgrammeStepRecord {
 schema:'sf88-research-quotation-programme-step/v1';programmeId:string;programmeSha256:string;workspaceId:string;
 stepId:string;selection:ResearchQuoteProgrammeSelection;selectionSha256:string;source:ResearchQuoteObject;
 sourceSha256:string;replayOf:string|null;inputFile:ResearchQuoteProgrammeFile;createdAt:string;
}
export interface ResearchQuoteProgrammeStepSummary {
 stepId:string;command:ResearchQuoteProgrammeCommand;action:string|null;profile:string|null;
 selectionSha256:string;sourceSha256:string;replayOf:string|null;createdAt:string;status:'PENDING'|'COMPLETE';
 nativeState:string|null;requestId:string|null;kind:ResearchQuoteKind|null;resultSha256:string|null;
 inputFile:ResearchQuoteProgrammeFile;
 next:null|{command:'apply'|'enroll-publication'|'apply-case-transfer';input:ResearchQuoteApplySelection};
}
export interface ResearchQuoteProgrammeNativeRun {
 schema:'sf88-research-quote-operator-inspected/v1';directory:string;
 request:ResearchQuoteObject;selection:null;original:ResearchQuoteObject|null;
 attempts:Array<{name:string;value:ResearchQuoteObject}>;
 result:null|{
  schema:'sf88-research-quote-operator-result/v1';workspaceId:string;requestSha256:string;attemptId:string;
  result:ResearchQuoteOperation|ResearchQuoteNativeResponse;resultSha256:string;completedAt:string;
 };
}
export interface ResearchQuoteProgrammeStep {
 schema:'sf88-research-quotation-programme-step/v1';directory:string;record:ResearchQuoteProgrammeStepRecord;
 input:ResearchQuoteObject;native:ResearchQuoteProgrammeNativeRun|null;summary:ResearchQuoteProgrammeStepSummary;
}
export interface ResearchQuoteProgrammeState {
 schema:'sf88-research-quotation-programme/v1';directory:string;programme:ResearchQuoteProgrammeHeader;
 steps:ResearchQuoteProgrammeStepSummary[];snapshot:string;
}
export interface ResearchQuoteProgrammeCreated {
 schema:'sf88-research-quotation-programme/v1';directory:string;programme:ResearchQuoteProgrammeHeader;reused:boolean;
}
export declare const RESEARCH_QUOTE_PROGRAMME_SCHEMA:'sf88-research-quotation-programme/v1';
export declare const RESEARCH_QUOTE_PROGRAMME_STEP_SCHEMA:'sf88-research-quotation-programme-step/v1';
export declare const RESEARCH_QUOTE_PROGRAMME_LIMIT:256;
export declare function researchQuoteProgrammeStepId(value:string):string;
export declare function researchQuoteProgrammeInput(value:unknown):ResearchQuoteProgrammeInput;
export declare function readResearchQuoteProgrammeJson(root:string,name:string,limit?:number):Promise<ResearchQuoteObject|null>;
export declare function readResearchQuoteProgrammeHeader(root:string):Promise<ResearchQuoteProgrammeHeader>;
export declare function createResearchQuoteProgramme(input:{
 client?:ResearchQuoteProgrammeClient;directory:string;input?:ResearchQuoteProgrammeInput;inputFile?:string;signal?:AbortSignal;
}):Promise<ResearchQuoteProgrammeCreated>;
export declare function researchQuoteProgrammeCommand(command:ResearchQuoteProgrammeCommand,value:object,selection?:{
 caseId?:string;action?:ResearchQuoteCaseAction|ResearchQuotePricingAction;profile?:string;
}):ResearchQuoteProgrammeSelection;
export declare function assertResearchQuoteProgrammeOperation(record:unknown,programme:ResearchQuoteProgrammeHeader):ResearchQuoteOperation;
export declare function readResearchQuoteProgrammeStepIn(root:string,programme:ResearchQuoteProgrammeHeader,stepId:string):Promise<ResearchQuoteProgrammeStep>;
export declare function readResearchQuoteProgramme(directory:string):Promise<ResearchQuoteProgrammeState>;
export declare function readResearchQuoteProgrammeStep(input:{directory:string;stepId:string}):Promise<ResearchQuoteProgrammeStep>;
export declare function submitResearchQuoteProgramme(input:{
 client?:ResearchQuoteProgrammeClient;directory:string;stepId:string;command?:ResearchQuoteProgrammeCommand;
 input?:object;inputFile?:string;action?:ResearchQuoteCaseAction|ResearchQuotePricingAction;profile?:string;signal?:AbortSignal;
}):Promise<ResearchQuoteProgrammeStep>;
export declare function applyResearchQuoteProgrammeReview(input:{
 client?:ResearchQuoteProgrammeClient;directory:string;sourceStepId:string;stepId:string;reviewSha256:string;signal?:AbortSignal;
}):Promise<ResearchQuoteProgrammeStep>;
export declare function replayResearchQuoteProgramme(input:{
 client?:ResearchQuoteProgrammeClient;directory:string;sourceStepId:string;stepId:string;signal?:AbortSignal;
}):Promise<ResearchQuoteProgrammeStep>;
