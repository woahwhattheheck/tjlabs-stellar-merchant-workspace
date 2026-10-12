/** MIT. Complete retained commissioning for the existing Research application. */
import type {ResearchQuoteHostInput,ResearchQuoteLaunchInspection} from './launch-inspection.mjs';
export interface ResearchQuotationApplicationSettings {
 workspaceDirectory?:string;connectionFile?:string;objectStateDirectory?:string;
 zoteroStateDirectory?:string;extractionPython?:string;customerCommerceHost?:string;customerQuotesHost?:string;
 openalexWorkspaceDirectory?:string;openalexModule?:string;editionAdapter?:string;
 crossrefState?:string;crossrefConfig?:string;documentSourceConfig?:string;pipelineSourceConfig?:string;
 port?:number;environmentFile?:string;
}
export interface ResearchQuotationApplicationSelection {
 runtimeId:string;applicationId?:string;expectedRevision?:string;homeId?:string;
}
export type ResearchQuotationSetupInput = {
 schema:'sf88-research-quotation-commissioning/v1';requestId:string;workspaceDirectory:string;
 runtimeDirectory:string;label:string;settings?:ResearchQuotationApplicationSettings;
 application?:ResearchQuotationApplicationSelection;
} & (
 {configurationFile:string;configuration?:never} |
 {configuration:ResearchQuoteHostInput;configurationFile?:never}
);
export interface ResearchQuotationSetupFile {name:string;bytes:number;sha256:string}
export interface ResearchQuotationRuntime {
 schema:'stellar-forge.managed-runtime.v1';directory:string;installationId:string;profileId:string;
 profileSha256:string;lockSha256:string;sourceCommit:string;sourceManifestSha256:string;
 dependencyCount:number;sourceRoot:string;
}
export interface ResearchQuotationApplicationRequest extends ResearchQuotationApplicationSelection {
 runtimeDirectory:string;kind:'research-dossiers';providerId:'research-dossiers';label:string;
 settings:ResearchQuotationApplicationSettings & {workspaceDirectory:string;customerQuotesHost:string;connectionFile:string};
}
export interface ResearchQuotationLaunchCommand {
 schema:'sf88-research-quotation-launch-command/v1';runtimeDirectory:string;command:'research-workspace';
 args:string[];environmentFile:string|null;bindingSha256:string;workspaceDirectory:string;connectionFile:string;
}
export interface ResearchQuotationSetupProof {
 schema:'sf88-research-quotation-commissioning-review/v1';requestSha256:string;
 runtime:ResearchQuotationRuntime;modules:Array<ResearchQuotationSetupFile & {path:string}>;
 configurationSource:ResearchQuotationSetupFile & {kind:'ORIGINAL_HOST'|'COMPLETE_INLINE_HOST';path:string};
 launch:ResearchQuoteLaunchInspection;
 settings:ResearchQuotationApplicationSettings & {workspaceDirectory:string;customerQuotesHost:string;connectionFile:string};
 application:ResearchQuotationApplicationRequest|null;command:ResearchQuotationLaunchCommand;
 files:ResearchQuotationSetupFile[];
}
export interface ResearchQuotationSetupResult {
 id:string;directory:string;workspaceDirectory:string;runtime:ResearchQuotationRuntime;
 configurationFile:string;connectionFile:string;launchBindingSha256:string;
 applicationSettingsFile:string;applicationRequestFile:string|null;directLaunchFile:string;reviewFile:string;
 files:ResearchQuotationSetupFile[];application:ResearchQuotationApplicationRequest|null;command:ResearchQuotationLaunchCommand;
}
export interface ResearchQuotationSetup {
 schema:'sf88-research-quotation-commissioning/v1';directory:string;id:string;
 status:'PREPARING'|'REVIEWED'|'COMPLETE';request:ResearchQuotationSetupInput;requestSha256:string;
 reviewSha256:string|null;review:ResearchQuotationSetupProof|null;result:ResearchQuotationSetupResult|null;
 createdAt:string;completedAt:string|null;
}
export interface ResearchQuotationSetupExport {
 schema:'sf88-research-quotation-commissioning-export/v1';sourceDirectory:string;directory:string;
 id:string;requestSha256:string;reviewSha256:string;resultSha256:string;
 files:ResearchQuotationSetupFile[];reused:boolean;
}
export const RESEARCH_QUOTATION_SETUP_SCHEMA:'sf88-research-quotation-commissioning/v1';
/** Omit input/inputFile only when reopening the same retained operation. */
export function prepareResearchQuotationSetup(options:{
 directory:string;input?:ResearchQuotationSetupInput;inputFile?:string;signal?:AbortSignal;
}):Promise<ResearchQuotationSetup>;
/** Complete local records are read before any original runtime/donor access. */
export function readResearchQuotationSetup(directory:string):Promise<ResearchQuotationSetup>;
export function saveResearchQuotationSetup(options:{
 directory:string;reviewSha256:string;signal?:AbortSignal;
}):Promise<ResearchQuotationSetup>;
/** Export is a complete record of the old selection; receiving uses a fresh local selection. */
export function exportResearchQuotationSetup(options:{
 directory:string;outputDirectory:string;signal?:AbortSignal;
}):Promise<ResearchQuotationSetupExport>;
