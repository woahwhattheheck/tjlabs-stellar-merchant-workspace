import type { FredDdpSourceFile,FredDdpFileDescriptor } from './files.mjs';
export interface FredDdpCrosswalkCapture {
  schema:'stellar-forge.fred-ddp-crosswalk.v1'; id:string; captureSha256:string; file:FredDdpSourceFile;
}
export interface FredDdpSourceSeries { release:string; boardSeriesId:string; }
export interface FredDdpCrosswalkRow extends FredDdpSourceSeries {
  row:number; fredSeriesId:string|null; original:Record<string,string>; location:{start:number;end:number;line:number};
}
export interface FredDdpCrosswalkSummary {
  rowCount:number;sourceSeriesCount:number;targetSeriesCount:number;releaseCount:number;
  ambiguousSourceSeriesCount:number;unmappedSourceSeriesCount:number;duplicateRowCount:number;
}
export interface FredDdpCrosswalkModel {
  schema:'stellar-forge.fred-ddp-crosswalk-model.v1';id:string;captureSha256:string;source:FredDdpFileDescriptor;
  header:unknown;rows:FredDdpCrosswalkRow[];releases:string[];summary:FredDdpCrosswalkSummary;
}
export interface FredDdpCrosswalkPageOptions { offset?:number;limit?:number;release?:string|null;query?:string; }
export interface FredDdpCrosswalkPage extends Omit<FredDdpCrosswalkModel,'rows'> {
  filter:{release:string|null;query:string};offset:number;limit:number;total:number;nextOffset:number|null;rows:FredDdpCrosswalkRow[];
}
export type FredDdpMappingDecision = FredDdpSourceSeries & (
  {action:'map';fredSeriesId:string;note:string}|{action:'exclude';note:string}
);
export type FredDdpMappingStatus='MAPPED'|'EXCLUDED'|'AMBIGUOUS'|'UNMAPPED';
export interface FredDdpMappingRow extends FredDdpSourceSeries {
  index:number;status:FredDdpMappingStatus;fredSeriesId:string|null;candidates:string[];
  sourceRows:FredDdpCrosswalkRow[];decision:FredDdpMappingDecision|null;
}
export interface FredDdpMappings {
  schema:'stellar-forge.fred-ddp-mappings.v1';id:string;crosswalkId:string;crosswalkSha256:string;
  series:FredDdpSourceSeries[];decisions:FredDdpMappingDecision[];rows:FredDdpMappingRow[];targets:string[];
  summary:{seriesCount:number;mappedCount:number;excludedCount:number;ambiguousCount:number;unmappedCount:number;targetSeriesCount:number};
}
export interface FredDdpCrosswalkComparison {
  schema:'stellar-forge.fred-ddp-crosswalk-comparison.v1';id:string;beforeId:string;afterId:string;
  beforeSource:FredDdpFileDescriptor;afterSource:FredDdpFileDescriptor;
  summary:{addedCount:number;removedCount:number;changedCount:number;unchangedCount:number};
  rows:Array<FredDdpSourceSeries & {status:'ADDED'|'REMOVED'|'CHANGED'|'UNCHANGED';beforeTargets:string[];afterTargets:string[];
    beforeRows:FredDdpCrosswalkRow[];afterRows:FredDdpCrosswalkRow[]}>;
}
export function fredDdpSourceSeries(value:unknown):FredDdpSourceSeries;
export function fredDdpTargetSeries(value:unknown):string;
export function sealFredDdpCrosswalk(input:{file:FredDdpSourceFile}):FredDdpCrosswalkCapture;
export function inspectFredDdpCrosswalk(capture:FredDdpCrosswalkCapture):FredDdpCrosswalkModel;
export function validateFredDdpCrosswalk(capture:unknown):FredDdpCrosswalkCapture;
export function pageFredDdpCrosswalk(capture:FredDdpCrosswalkCapture,options?:FredDdpCrosswalkPageOptions):FredDdpCrosswalkPage;
export function resolveFredDdpMappings(input:{crosswalk:FredDdpCrosswalkCapture;series:FredDdpSourceSeries[];decisions?:FredDdpMappingDecision[]}):FredDdpMappings;
export function validateFredDdpMappings(value:unknown,context:{crosswalk:FredDdpCrosswalkCapture}):FredDdpMappings;
export function compareFredDdpCrosswalks(input:{before:FredDdpCrosswalkCapture;after:FredDdpCrosswalkCapture}):FredDdpCrosswalkComparison;
