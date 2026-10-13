/** MIT. Complete returned comparison adoption on the original dossier. */
import type {Actor,Json,VersionRecord,RunRecord,Operation,Download,DownloadOptions} from './client.mjs';
export type AdoptionStatus='COMPLETE'|'NEEDS_REVIEW'|'SUPERSEDED';
export type SourceSection='cases'|'candidates'|'runs'|'judgments'|'decisions'|'sources';
export interface ReviewAttribution{requestId:string;expectedRevision:number;actor:Actor;reviewedAt:string;reviewNote:string}
export interface AdoptionSelection{candidateVersionIds:string[];runIds:string[];judgmentVersionIds:string[];decisionVersionIds:string[]}
export type CaseTarget={mode:'NEW_CASE'}|{mode:'NEW_PROTOCOL';caseId:string;caseVersionId:string}|{mode:'EXISTING';caseId:string;caseVersionId:string};
export type CandidateTarget={sourceVersionId:string;mode:'NEW'}|{sourceVersionId:string;mode:'EXISTING';targetVersionId:string};
export type AdoptionRequest=ReviewAttribution&(
 {sourceId:string;caseVersionId:string;selection:AdoptionSelection;caseTarget:CaseTarget;candidateTargets:CandidateTarget[]}|
 {continuationOf:string}
);
export type PreparedAdoptionRequest=AdoptionRequest&{previewSha256:string};
export interface SourceDescriptor{id:string;sha256:string;bytes:number;filename?:string;contentType?:string;incomingHead?:unknown;[key:string]:unknown}
export interface AdoptionStep{index:number;sourceKind:string;sourceVersionId:string;requestId:string;action:Operation['action'];expectedRevision:number;targetId:string;targetVersionId:string;[key:string]:unknown}
export interface AdoptionPlan{id:string;request:AdoptionRequest;source:SourceDescriptor;base:unknown;ancestor:unknown;case:VersionRecord;selection:AdoptionSelection;mappings:unknown;steps:AdoptionStep[];[key:string]:unknown}
export interface AdoptionProgress{completed:number;total:number;nextIndex:number|null;operations:Operation[];mappings:unknown;[key:string]:unknown}
export interface AdoptionResult{
 schema:'sf88-research-comparison-adoption/v1';dossierId:string;revision:number;planId:string;requestId:string;status:AdoptionStatus;
 duplicate:boolean;plan:AdoptionPlan;progress:AdoptionProgress;successorPlanId:string|null;
 conflict:null|{expectedRevision:number;currentRevision:number};[key:string]:unknown
}
export interface AdoptionPreview{
 schema:'sf88-research-comparison-adoption/v1';dossierId:string;revision:number;eligible:boolean;
 issues:{code:string;recordId?:string;editionId?:string;detail:unknown}[];previewSha256:string|null;plan:AdoptionPlan
}
export interface AdoptionPage{
 schema:'sf88-research-comparison-adoption/v1';dossierId:string;revision:number;
 items:unknown[];total:number;offset:number;limit:number;nextOffset:number|null;complete:boolean;sources?:SourceDescriptor[]
}
export interface AdoptionSourcePage extends AdoptionPage{
 source:SourceDescriptor;ancestor:unknown;incomingHead:unknown;case:VersionRecord|null;
 targets:{cases:VersionRecord[];protocols:VersionRecord[];candidates:VersionRecord[]};
 sourceBindings:{editionId:string;status:'EXACT'|'MISSING'|'DIFFERENT';original:unknown;current:unknown}[]
}
export interface AdoptionLookup{schema:'sf88-research-comparison-adoption/v1';dossierId:string;revision:number;adoption:AdoptionResult|null}
export interface ReadOptions{revision?:number;signal?:AbortSignal}
export interface PageOptions extends ReadOptions{offset?:number;limit?:number}
export interface SourceOptions extends PageOptions{sourceId:string;caseVersionId?:string;section?:SourceSection}
export type LookupOptions=ReadOptions&({planId:string;requestId?:never}|{requestId:string;planId?:never});
export interface ComparisonAdoptionClient{
 comparisonAdoptions(id:string,options?:PageOptions):Promise<AdoptionPage>;
 comparisonAdoptionSource(id:string,options:SourceOptions):Promise<AdoptionSourcePage>;
 previewComparisonAdoption(id:string,input:AdoptionRequest,options?:{signal?:AbortSignal}):Promise<AdoptionPreview>;
 reviewComparisonAdoption(id:string,input:PreparedAdoptionRequest,options?:{signal?:AbortSignal}):Promise<AdoptionResult>;
 comparisonAdoption(id:string,options:LookupOptions):Promise<AdoptionLookup>;
 comparisonAdoptionFile(id:string,options:DownloadOptions&{sourceId:string;runId:string;artifactId?:string;revision?:number}):Promise<Download>;
 exportComparisonAdoption(id:string,options:DownloadOptions&{planId:string;revision?:number;format?:'json'|'html'|'source'}):Promise<Download>;
}
export function createComparisonAdoptionClient(transport:{request:Function;download:Function}):ComparisonAdoptionClient;
