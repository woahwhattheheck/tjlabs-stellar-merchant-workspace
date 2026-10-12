import type { FredBriefingTemplate } from '../briefing/templates.mjs';
export declare const FRED_RELEASE_WATCH: 'stellar-forge.fred-release-watch.v1';
export type FredReleaseWatchId = `fred-release-watch-${string}`;
export type FredReleaseCatchUpPolicy = 'all_vintages' | 'latest_vintage';
export interface FredReleaseWatchInput {
  name: string; series?: string[]; template?: FredBriefingTemplate | null;
  observationStart: string; observationEnd?: string | 'as_of'; baselineAsOf: string;
  catchUp?: FredReleaseCatchUpPolicy; pageSize?: number; maxRows?: number;
}
export interface FredReleaseWatch {
  schema: 'stellar-forge.fred-release-watch.v1'; id: FredReleaseWatchId; name: string; series: string[];
  template: FredBriefingTemplate | null; observationStart: string; observationEnd: string | 'as_of';
  baselineAsOf: string; catchUp: FredReleaseCatchUpPolicy; pageSize: number; maxRows: number;
}
export declare function createFredReleaseWatch(input: FredReleaseWatchInput): FredReleaseWatch;
export declare function validateFredReleaseWatch(input: unknown): FredReleaseWatch;
