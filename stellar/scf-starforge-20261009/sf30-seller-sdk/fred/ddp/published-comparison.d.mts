import type { FredDdpPackageCapture } from './package.mjs';
import type { FredDdpCrosswalkCapture } from './crosswalk.mjs';
import type { FredDdpMigrationPlan } from './migration.mjs';
import type { FredPublishedTargetManifest } from './published-source.mjs';
export type FredCurrentPublicationStatus='EQUAL'|'DIFFERENT'|'BOTH_MISSING'|'MISSING_CHANGED'|'SOURCE_ONLY'|'TARGET_ONLY';
export interface FredCurrentPublicationContext {
  packageCapture:FredDdpPackageCapture;crosswalk:FredDdpCrosswalkCapture;plan:FredDdpMigrationPlan;
  manifest:FredPublishedTargetManifest;directory:string;
}
export interface FredCurrentPublicationComparison {
  schema:'stellar-forge.fred-ddp-current-publication-comparison.v1';id:string;basis:'CURRENT_PUBLICATION_RETRIEVAL';
  packageId:string;packageSha256:string;crosswalkId:string;crosswalkSha256:string;sourcePlanId:string;
  series:Array<Record<string,unknown>>;
  summary:{seriesCount:number;sourceObservationCount:number;targetOriginalObservationCount:number;rowCount:number;
    counts:Record<FredCurrentPublicationStatus,number>;[key:string]:unknown};
  targetRetrieval:{from:string;through:string};files:Array<{name:string;bytes:number;sha256:string}>;
  rowIndex:{stride:number;rows:Array<{row:number;byte:number}>};
  sourceLocationBasis:'UTF8_BYTE_OFFSETS_END_EXCLUSIVE';differenceBasis:'TARGET_MINUS_SOURCE_AFTER_EXPLICIT_SCALES';
  [key:string]:unknown;
}
export function compareFredDdpCurrentPublication(options:FredCurrentPublicationContext&{outputDirectory:string;
  onProgress?:(progress:Record<string,unknown>)=>unknown|Promise<unknown>}):Promise<FredCurrentPublicationComparison>;
export function readFredDdpCurrentPublicationComparison(outputDirectory:string,context:FredCurrentPublicationContext):Promise<FredCurrentPublicationComparison|null>;
