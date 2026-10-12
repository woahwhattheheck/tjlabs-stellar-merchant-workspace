import type { FredDdpSourceFile,FredDdpFileDescriptor } from './files.mjs';
export type FredDdpPackageFormat='board-sdmx-zip'|'board-sdmx-xml'|'ddp-csv';
export type FredDdpMetadataKey='title'|'frequency'|'unit'|'multiplier'|'currency'|'seasonalAdjustment';
export type FredDdpCsvLayout=
  | {layout:'columns';headerRow:number;dataStartRow:number;dataEndRow?:number|null;periodColumn?:number;seriesColumns?:number[]|null;
      metadataRows?:Partial<Record<FredDdpMetadataKey,number>>}
  | {layout:'rows';headerRow:number;dataStartRow:number;dataEndRow?:number|null;seriesColumn?:number;periodColumns?:number[]|null;
      metadataColumns?:Partial<Record<FredDdpMetadataKey,number>>}
  | {layout:'lists';blocks:Array<{seriesCell:{row:number;column:number};dataStartRow:number;dataEndRow:number;periodColumn?:number;valueColumn?:number;
      metadataCells?:Partial<Record<FredDdpMetadataKey,{row:number;column:number}>>}>};
export interface FredDdpPackageCapture {
  schema:'stellar-forge.fred-ddp-package.v1';id:string;captureSha256:string;file:FredDdpSourceFile;release:string;
  format:FredDdpPackageFormat;supplementalFiles:FredDdpSourceFile[];csvLayout:FredDdpCsvLayout|null;
}
export interface FredDdpSourceMeaning {
  code:string|null;label:string|null;definitions?:unknown[];
}
export interface FredDdpPackageObservation {
  index:number;period:string;value:string;status:string|null;original:Record<string,unknown>;location:Record<string,unknown>;
}
export interface FredDdpPackageSeries {
  id:string;index:number;release:string;boardSeriesId:string;datasetId:string|null;title:string|null;
  frequency:FredDdpSourceMeaning;unit:FredDdpSourceMeaning;multiplier:FredDdpSourceMeaning;currency:FredDdpSourceMeaning;seasonalAdjustment:FredDdpSourceMeaning;
  annotations:unknown[];original:Record<string,unknown>;location:Record<string,unknown>;observations:FredDdpPackageObservation[];
}
export interface FredDdpPackageSummary {seriesCount:number;observationCount:number;datasetCount:number;firstPeriod:string|null;lastPeriod:string|null;}
export interface FredDdpPackageModel {
  schema:'stellar-forge.fred-ddp-package-model.v1';id:string;captureSha256:string;release:string;format:FredDdpPackageFormat;source:FredDdpFileDescriptor;
  header:Record<string,unknown>;files:Array<{name:string;mediaType:string;bytes:number;sha256:string;archive:string|null}>;
  series:FredDdpPackageSeries[];summary:FredDdpPackageSummary;
}
export type FredDdpPackageSeriesRow=Omit<FredDdpPackageSeries,'observations'>&{observationCount:number;firstPeriod:string|null;lastPeriod:string|null};
export type FredDdpPackageObservationRow=FredDdpPackageObservation & {seriesId:string;release:string;boardSeriesId:string;datasetId:string|null};
export interface FredDdpPackagePageOptions {
  section?:'series'|'observations';seriesId?:string|null;frequency?:string|null;query?:string;offset?:number;limit?:number;
}
export interface FredDdpPackagePage extends Omit<FredDdpPackageModel,'series'> {
  frequencies:Array<{code:string|null;label:string|null;count:number}>;filter:{frequency:string|null;query:string};
  section:'series'|'observations';seriesId:string|null;offset:number;limit:number;total:number;nextOffset:number|null;
  rows:Array<FredDdpPackageSeriesRow|FredDdpPackageObservationRow>;
}
export const FRED_DDP_PACKAGE_FORMATS:readonly FredDdpPackageFormat[];
export function normalizeFredDdpCsvLayout(input:unknown):FredDdpCsvLayout|null;
export function normalizeFredDdpRelease(input:unknown):string;
export function sealFredDdpPackage(input:{file:FredDdpSourceFile;release:string;format?:FredDdpPackageFormat;supplementalFiles?:FredDdpSourceFile[];csvLayout?:FredDdpCsvLayout|null}):FredDdpPackageCapture;
export function inspectFredDdpPackage(capture:FredDdpPackageCapture):FredDdpPackageModel;
export function validateFredDdpPackage(capture:unknown):FredDdpPackageCapture;
export function pageFredDdpPackage(capture:FredDdpPackageCapture,options?:FredDdpPackagePageOptions):FredDdpPackagePage;
