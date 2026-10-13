import type {Buffer} from 'node:buffer';
import type {GrantJsonResponse,GrantResponseSource,GrantObject} from './agent-client.mjs';
export const RESEARCH_INSTALLATION_SCHEMA:'stellar-forge.research-installation-source-desk.v1';
export type ResearchInstallationKind='project'|'issued-package'|'customer-return';
export const RESEARCH_INSTALLATION_LIMITS:Readonly<Record<ResearchInstallationKind,number>>;
export const RESEARCH_INSTALLATION_MAX_ARCHIVE:number;
export const RESEARCH_INSTALLATION_INPUT_KINDS:Readonly<Record<'research-project'|'research-issued-package'|'research-customer-return',ResearchInstallationKind>>;
export interface ResearchInstallationSelection {caseId:string;draftId:string}
export interface ResearchInstallationFile extends ResearchInstallationSelection {
 id:string;requestId:string;actor:string;kind:ResearchInstallationKind;name:string;bytes:number;sha256:string;sourceUrl:string;observedAt:string;
}
export interface ResearchInstallationIntent extends Omit<ResearchInstallationFile,'id'> {schema:typeof RESEARCH_INSTALLATION_SCHEMA}
export type ResearchInstallationUploadResult =
 | (ResearchInstallationSelection & {schema:typeof RESEARCH_INSTALLATION_SCHEMA;requestId:string;actor:string;status:'NOT_RECORDED';inputIntentRetained?:true})
 | (ResearchInstallationIntent & {status:'INPUT_RETAINED'})
 | (ResearchInstallationSelection & {schema:typeof RESEARCH_INSTALLATION_SCHEMA;requestId:string;actor:string;status:'COMPLETE';request:ResearchInstallationIntent;file:ResearchInstallationFile;inspection:GrantObject});
export interface ResearchInstallationTemplate {
 expectedVersion:number;sourceId:string;expectedSourceSha256:string;packetSourceId?:string|null;expectedPacketSha256?:string|null;
 workshareCaseId:string;installationId:string|null;expectedRevision:number;document?:GrantObject;
}
export interface ResearchInstallationArchiveSelection extends ResearchInstallationSelection {
 preparationId:string;installationId:string;revision:number;expectedSha256?:string;
}
export interface ResearchInstallationArchiveFile {name:string;bytes:number;sha256:string;kind:'installation-archive'}
export interface ResearchInstallationInputs {
 import:ResearchInstallationSelection&{requestId:string;actor:string;kind:ResearchInstallationKind;name:string;bytes:Buffer|Uint8Array;sha256:string;sourceUrl:string;observedAt:string};
 request:ResearchInstallationSelection&{requestId:string;actor:string};
 resume:ResearchInstallationInputs['request'];
 'original-request':ResearchInstallationSelection&{requestId:string};
 inspect:ResearchInstallationSelection&{fileId:string;expectedSha256:string};
 template:ResearchInstallationSelection&{body:ResearchInstallationTemplate};
 'file-describe':ResearchInstallationInputs['inspect'];
 'archive-describe':ResearchInstallationArchiveSelection;
}
export interface ResearchInstallationValues {
 import:ResearchInstallationUploadResult;request:ResearchInstallationUploadResult;resume:ResearchInstallationUploadResult;
 'original-request':{schema:string;caseId:string;originCaseId:string;draftId:string;record:GrantObject;qualification:string};
 inspect:{file:ResearchInstallationFile;inspection:GrantObject};
 template:GrantObject&{document:GrantObject;profile:GrantObject;engine:GrantObject};
 'file-describe':ResearchInstallationFile;'archive-describe':ResearchInstallationArchiveFile;
}
export type ResearchInstallationResponses={ [K in keyof ResearchInstallationInputs]:GrantJsonResponse<ResearchInstallationValues[K]> };
export interface ResearchInstallationDownloads {
 file:ResearchInstallationInputs['inspect'];
 archive:ResearchInstallationArchiveSelection&{expectedSha256:string};
}
export interface ResearchInstallationDownloaded {
 file:{path:string;bytes:number;sha256:string;name:string;contentType:string};
 descriptor:ResearchInstallationFile|ResearchInstallationArchiveFile;source:GrantResponseSource;status:number;reused:boolean;
}
export function researchInstallationInputLimit(kind:string):number|null;
export function researchInstallationUploadLimit(target:URL,contentType:string,body:unknown):number|null;
export interface ResearchInstallationPlan {action:string;input:GrantObject;route:string;options:GrantObject}
export function planResearchInstallationOperation(action:keyof ResearchInstallationInputs|keyof ResearchInstallationDownloads,input:GrantObject):ResearchInstallationPlan;
export function performResearchInstallationOperation(plan:ResearchInstallationPlan,send:(route:string,options:GrantObject)=>Promise<unknown>):Promise<unknown>;
export function receiveResearchInstallationFile(plan:ResearchInstallationPlan,send:(route:string,options:GrantObject)=>Promise<unknown>,filename:string):Promise<ResearchInstallationDownloaded>;
