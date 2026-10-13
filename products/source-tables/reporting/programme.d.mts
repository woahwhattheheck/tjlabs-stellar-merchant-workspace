import type {TableProject,TableMapping,NativeStarter} from '../../../stellar-forge/developer-site/dist/source-table-workspace.mjs';
export type Json = null|boolean|number|string|Json[]|{[key:string]:Json};
export interface OriginalFile {filename:string;encoding?:'utf8'|'base64';content:string;mediaType?:string;bytes?:number;sha256?:string}
export interface FileReference {filename:string;bytes:number;sha256:string}
export interface Calendar {status:'proposed'|'configured'|'manual';timezone:string;expression?:string;rule:string;nativeScheduleId?:string}
export interface ReportDefinition {id:string;title:string;meaning:string;parameters:Record<string,Json>;calendar:Calendar;sourceDescription:string;query:OriginalFile}
export interface RunInput {id:string;reportId:string;definitionSha256:string;status:'complete'|'failed'|'truncated';provider:{runId:string;queryVersion:string;[key:string]:Json};period:Record<string,Json>;parameters:Record<string,Json>;sourceSnapshot:string;reportedRows:number|null;notes?:string;files?:OriginalFile[];result?:OriginalFile&{delimiter?:','|'\t'|';'|'|';header?:boolean;skipEmptyRecords?:boolean;mapping?:TableMapping}}
export interface DeliveryInput {id:string;runId:string;status:'succeeded'|'failed'|'uncertain'|'suppressed-empty';routeId:string;destination:string;notes?:string;predecessorId?:string;receipt?:OriginalFile}
export interface RequestBase {operationId:string;at:string;actor:string;expectedProjectSha256?:string}
export type ProgrammeRequest = RequestBase & (
 {kind:'create';input:{id:string;label:string;reports:ReportDefinition[];starter?:NativeStarter}} |
 {kind:'define';input:ReportDefinition} | {kind:'run';input:RunInput} |
 {kind:'delivery';input:DeliveryInput} | {kind:'source';input:{description:string;files:OriginalFile[];[key:string]:unknown}});
export interface ReportingProject extends TableProject {reportingProgramme:{schema:'stellar-forge.reporting-programme.v1';id:string;label:string;createdAt:string;files:Required<OriginalFile>[];definitions:unknown[];runs:unknown[];deliveries:unknown[];registers:Record<string,string>;operations:unknown[]}}
export declare const SCHEMA:'stellar-forge.reporting-programme.v1';
export declare function openProgramme(input:unknown):Promise<ReportingProject>;
export declare function applyProgramme(input:unknown|null,request:ProgrammeRequest):Promise<{project:ReportingProject;replayed:boolean;operation:unknown;projectSha256?:string}>;
export declare function programmeSummary(project:ReportingProject):Record<string,unknown>;
export declare function exportProgramme(input:unknown):Promise<{project:ReportingProject;summary:Record<string,unknown>;files:{path:string;content:string|Uint8Array}[];bytes:Uint8Array}>;
export declare function programmeIdentity(input:unknown):Promise<{projectSha256:string;summary:Record<string,unknown>}>;
