export type CapturedEditionJSON = null | boolean | number | string |
  CapturedEditionJSON[] | { [key: string]: CapturedEditionJSON };
export interface CapturedEditionPackage {
  name:string;id?:string;manifestSha256:string;sourceFile?:string;sourceSha256?:string;
  planSha256?:string;sourceRevisionSha256?:string;createdAt?:string;
}
export interface CapturedEditionFile {name:string;bytes:number;sha256:string}
export interface CapturedEditionSnapshot {
  schema:'stellar-forge.captured-merchant-edition.v1';package:CapturedEditionPackage;
  files:CapturedEditionFile[];totalBytes:number;
  plan:{schema:'stellar-forge.api-merchant-plan.v1';operations:Array<{
    method:string;path:string;amountAtomic:string;[field:string]:CapturedEditionJSON
  }>;[field:string]:CapturedEditionJSON};
  sourceDocument:Record<string,CapturedEditionJSON>;
  facade:Record<string,CapturedEditionJSON>;configuration:Record<string,CapturedEditionJSON>;
}
export type CapturedEditionPresence={present:false}|{present:true;value:CapturedEditionJSON};
export interface CapturedEditionChange {
  field:string;category:string;current:CapturedEditionPresence;incoming:CapturedEditionPresence;
}
export type CapturedEditionState='ADDED'|'REMOVED'|'CHANGED'|'UNCHANGED';
export interface CapturedEditionCounts {total:number;added:number;removed:number;changed:number;unchanged:number}
export interface CapturedEditionSummary {
  routes:CapturedEditionCounts;prices:number;settings:number;source:number;contract:number;
  configuration:number;files:CapturedEditionCounts;
}
export interface CapturedMerchantEditionComparison {
  schema:'stellar-forge.captured-merchant-edition-comparison.v1';
  current:CapturedEditionPackage|null;incoming:CapturedEditionPackage;summary:CapturedEditionSummary;
  routes:Array<{key:string;method:string;path:string;state:CapturedEditionState;
    currentPrice:CapturedEditionPresence;incomingPrice:CapturedEditionPresence;changes:CapturedEditionChange[]}>;
  settings:CapturedEditionChange[];source:CapturedEditionChange[];contract:CapturedEditionChange[];
  configuration:CapturedEditionChange[];
  files:Array<{name:string;state:CapturedEditionState;current:CapturedEditionFile|null;incoming:CapturedEditionFile|null}>;
}
export const CAPTURED_EDITION_SNAPSHOT_SCHEMA:'stellar-forge.captured-merchant-edition.v1';
export const CAPTURED_EDITION_COMPARISON_SCHEMA:'stellar-forge.captured-merchant-edition-comparison.v1';
/** Exact JSON differences, including original source/facade declarations. Atomic prices remain strings. */
export function compareCapturedMerchantEditions(input:{
  current?:CapturedEditionSnapshot|null;incoming:CapturedEditionSnapshot
}):CapturedMerchantEditionComparison;
