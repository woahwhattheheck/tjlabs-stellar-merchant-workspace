import type { FredPublishedTargetManifest } from './published-source.mjs';
import type { FredCurrentPublicationComparison } from './published-comparison.mjs';
export interface FredPublishedProgrammeIO {
  stdout?:{write(text:string):unknown};stderr?:{write(text:string):unknown};signal?:AbortSignal;
}
export interface FredPublishedProgrammeOptions extends FredPublishedProgrammeIO {
  workspace:string;packagePath:string;crosswalkPath:string;planPath:string;manifestPath?:string|null;
  project?:string;receive?:string;output?:string;collect?:boolean;intake?:string;
}
export interface FredPublishedOriginalsSummary {publicFiles:number;publicBytes:number;boardFiles:number;boardBytes:number;}
export interface FredPublishedProgrammeSummary {
  schema:'tjlabs.scf-fred-ddp-current-published-programme.v1';finishedAt:string;comparisonId:string;
  summary:FredCurrentPublicationComparison['summary'];sourceMode:'PUBLIC_TABLE';timeBasis:'PUBLIC_TABLE_RETRIEVAL_DATE';
  captureCount:number;observations:number;bundleSchema:string;bundleSha256:string;projectId:string;
  received:Record<string,unknown>;exactOriginalFiles:number;exactOriginalBytes:number;
  originals:FredPublishedOriginalsSummary;elapsedMs:number;memory:Record<string,number>;
}
export const USAGE:string;
export function collectFredDdpCurrentPublications(options:FredPublishedProgrammeIO&{
  workspace:string;planPath:string;intake?:string;
}):Promise<FredPublishedTargetManifest>;
export function materializeFredPublishedOriginals(options:{bundle:unknown;directory:string}):Promise<FredPublishedOriginalsSummary>;
export function runFredDdpPublishedProgramme(options:FredPublishedProgrammeOptions):Promise<FredPublishedProgrammeSummary>;
export function main(argv?:string[],io?:FredPublishedProgrammeIO):Promise<unknown>;
