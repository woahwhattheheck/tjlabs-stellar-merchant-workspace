import type { FredDdpPackageCapture } from './package.mjs';
import type { FredDdpCrosswalkCapture,FredDdpMappingDecision,FredDdpMappings,FredDdpMappingRow,FredDdpMappingStatus } from './crosswalk.mjs';
export type FredDdpPeriodRule='exact'|'month'|'quarter'|'semiannual'|'year';
export type FredDdpMigrationWindow={kind:'source'}|{kind:'fixed';start:string;end:string}|{kind:'last';count:number};
export interface FredDdpMigrationBinding {
  seriesId:string;periodRule?:FredDdpPeriodRule|null;sourceScale?:string;targetScale?:string;
  expectedFredUnits?:string|null;expectedFredFrequency?:string|null;expectedFredSeasonalAdjustment?:string|null;note:string;
}
export interface FredDdpNormalizedMigrationBinding {
  seriesId:string;periodRule:FredDdpPeriodRule|null;sourceScale:string;targetScale:string;
  expectedFredUnits:string|null;expectedFredFrequency:string|null;expectedFredSeasonalAdjustment:string|null;note:string;
}
export interface FredDdpMigrationInput {
  name:string;asOf:string;window?:FredDdpMigrationWindow;decisions?:FredDdpMappingDecision[];bindings?:FredDdpMigrationBinding[];
  pageSize?:number;maxRows?:number;bookmark?:string|null;note?:string;
}
export interface FredDdpNormalizedMigrationInput extends Omit<Required<FredDdpMigrationInput>,'bindings'> {
  bindings:FredDdpNormalizedMigrationBinding[];
}
export interface FredDdpFredSelection {
  schema:'stellar-forge.fred-selection.v1';series:string[];asOf:string;start:string;end:string;pageSize:number;maxRows:number;
}
export interface FredDdpMigrationAcquisition {id:string;series:string[];selection:FredDdpFredSelection;}
export interface FredDdpMigrationSeries {
  id:string;index:number;release:string;boardSeriesId:string;datasetId:string|null;title:string|null;fredSeriesId:string|null;
  mappingStatus:FredDdpMappingStatus;binding:FredDdpNormalizedMigrationBinding & {reviewed:boolean};
  sourceIndices:number[];selectedObservationCount:number;
  window:{kind:FredDdpMigrationWindow['kind'];start:string|null;end:string|null;originalStart:string|null;originalEnd:string|null};
  issues:Array<{code:string;sourceIndices:number[];message:string}>;
}
export interface FredDdpMigrationSummary {
  ready:boolean;seriesCount:number;mappedCount:number;excludedCount:number;unmappedCount:number;ambiguousCount:number;
  targetSeriesCount:number;acquisitionCount:number;selectedObservationCount:number;unresolvedPeriodCount:number;emptyWindowSeriesCount:number;
}
export interface FredDdpMigrationPlan {
  schema:'stellar-forge.fred-ddp-migration-plan.v1';id:string;packageId:string;packageSha256:string;crosswalkId:string;crosswalkSha256:string;
  input:FredDdpNormalizedMigrationInput;mappings:FredDdpMappings;series:FredDdpMigrationSeries[];acquisitions:FredDdpMigrationAcquisition[];summary:FredDdpMigrationSummary;
}
export type FredDdpMigrationPlanSection='series'|'acquisitions'|'mappings';
export interface FredDdpMigrationPlanPageOptions {section?:FredDdpMigrationPlanSection;offset?:number;limit?:number;}
export interface FredDdpMigrationPlanPage extends Omit<FredDdpMigrationPlan,'series'|'acquisitions'|'mappings'> {
  section:FredDdpMigrationPlanSection;offset:number;limit:number;total:number;nextOffset:number|null;
  rows:Array<FredDdpMigrationSeries|FredDdpMigrationAcquisition|FredDdpMappingRow>;
}
export function normalizeFredDdpMigrationInput(input:unknown):FredDdpNormalizedMigrationInput;
export function buildFredDdpMigrationPlan(input:FredDdpMigrationInput & {packageCapture:FredDdpPackageCapture;crosswalk:FredDdpCrosswalkCapture}):FredDdpMigrationPlan;
export function validateFredDdpMigrationPlan(plan:unknown,context?:{packageCapture?:FredDdpPackageCapture|null;crosswalk?:FredDdpCrosswalkCapture|null}):FredDdpMigrationPlan;
export function pageFredDdpMigrationPlan(plan:FredDdpMigrationPlan,options?:FredDdpMigrationPlanPageOptions):FredDdpMigrationPlanPage;
