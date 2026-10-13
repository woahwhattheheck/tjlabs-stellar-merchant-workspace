import type { FredDdpFileDescriptor } from './files.mjs';
import type { FredDdpPackageCapture,FredDdpPackageObservation } from './package.mjs';
import type { FredDdpCrosswalkCapture } from './crosswalk.mjs';
import type { FredDdpMigrationPlan,FredDdpFredSelection,FredDdpNormalizedMigrationBinding } from './migration.mjs';
export type FredDdpReceivingStatus='EQUAL'|'DIFFERENT'|'BOTH_MISSING'|'MISSING_CHANGED'|'SOURCE_ONLY'|'TARGET_ONLY'|'MEANING_REVIEW'|'EXCLUDED'|'UNMAPPED'|'AMBIGUOUS';
export const FRED_DDP_RECEIVING_STATUSES:readonly FredDdpReceivingStatus[];
export interface FredDdpOriginalFredCapture {captureSha256:string;selection:FredDdpFredSelection;[field:string]:unknown;}
export interface FredDdpTargetObservation {
  series:string;date:string;value:string;missing:boolean;as_of:string;time_basis:string;
  realtime_start:string;realtime_end:string;units:string;frequency:string;seasonal_adjustment:string;captureId:string;periodKey:string;
}
export interface FredDdpReceivingRow {
  index:number;seriesId:string;release:string;boardSeriesId:string;fredSeriesId:string|null;period:string;periodKey:string;
  status:FredDdpReceivingStatus;source:(FredDdpPackageObservation & {missing?:boolean})|null;target:FredDdpTargetObservation|null;
  /** Exact FRED minus Board in the original unscaled numeric strings. */
  rawDifference:string|null;
  /** Exact scaled FRED minus scaled Board, available after source meanings agree. */
  difference:string|null;
}
export interface FredDdpReceivingMeaning {
  seriesId:string;source:Record<string,unknown>;target:Record<string,unknown>|null;
  binding:FredDdpNormalizedMigrationBinding & {reviewed:boolean};compatible:boolean;
  issues:Array<{field:string;source:unknown;target:unknown;message:string}>;
}
export interface FredDdpReceivingSummary {
  rowCount:number;seriesCount:number;counts:Record<FredDdpReceivingStatus,number>;meaningReviewSeriesCount:number;
  comparedCount:number;differentCount:number;missingChangedCount:number;sourceOnlyCount:number;targetOnlyCount:number;
}
export interface FredDdpReceiving {
  schema:'stellar-forge.fred-ddp-receiving.v1';id:string;planId:string;packageId:string;packageSha256:string;crosswalkId:string;crosswalkSha256:string;
  source:{sourceMode:'DDP_CURRENT_PUBLISHED';package:FredDdpFileDescriptor;crosswalk:FredDdpFileDescriptor;fredAsOf:string;bookmark:string|null;note:string};
  captures:Array<{id:string;captureSha256:string;selection:FredDdpFredSelection}>;
  meanings:FredDdpReceivingMeaning[];rows:FredDdpReceivingRow[];summary:FredDdpReceivingSummary;
}
export interface FredDdpReceivingPageOptions {offset?:number;limit?:number;changesOnly?:boolean;seriesId?:string|null;}
export interface FredDdpReceivingPage extends Omit<FredDdpReceiving,'rows'> {
  filter:{changesOnly:boolean;seriesId:string|null};offset:number;limit:number;total:number;nextOffset:number|null;rows:FredDdpReceivingRow[];
}
export interface FredDdpReceivingContext {
  packageCapture:FredDdpPackageCapture;crosswalk:FredDdpCrosswalkCapture;plan:FredDdpMigrationPlan;captures:FredDdpOriginalFredCapture[];
}
export function buildFredDdpReceiving(input:FredDdpReceivingContext):FredDdpReceiving;
export function validateFredDdpReceiving(value:unknown,context?:Partial<{[K in keyof FredDdpReceivingContext]:FredDdpReceivingContext[K]|null}> & {copy?:boolean}):FredDdpReceiving;
export function pageFredDdpReceiving(value:FredDdpReceiving,options?:FredDdpReceivingPageOptions):FredDdpReceivingPage;
