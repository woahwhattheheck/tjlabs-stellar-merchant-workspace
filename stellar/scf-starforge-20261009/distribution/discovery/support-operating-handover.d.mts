import type {OperatingPlan} from './operating-plan.mjs';
import type {SupportOperatingSource} from './support-operating-plan.mjs';
import type {SupportOperatingReturn} from './support-operating-return.mjs';
export const SUPPORT_HANDOVER_SCHEMA:'stellar-forge.support-operating-handover.v1';
export const SUPPORT_HANDOVER_DOCUMENT:'HANDOVER.json';
export const SUPPORT_HANDOVER_MAX_DOCUMENT_BYTES:number;
export const SUPPORT_HANDOVER_MAX_ARCHIVE_BYTES:number;
export interface SupportHandoverArtifact {path:string;bytes:number;sha256:string}
export interface SupportHandoverSourceManifest {
  schema:'stellar-forge.oauth-support-operating-package.v1';
  source:SupportHandoverArtifact;
  case:{id:string;revision:string;ancestors:string[]};
  files:SupportHandoverArtifact[];bytes:number;
}
export interface SupportHandoverCompanion {
  sourceIndex:number;
  sourceFile:SupportHandoverArtifact;
  manifestFile:SupportHandoverArtifact;
  manifest:SupportHandoverSourceManifest;
}
export interface SupportOperatingHandover {
  schema:typeof SUPPORT_HANDOVER_SCHEMA;
  id:string;title:string;owner:string;createdAt:string;
  plan:OperatingPlan;sources:SupportOperatingSource[];
  returns:SupportOperatingReturn[];companions:SupportHandoverCompanion[];
}
export interface SupportHandoverBlob {
  readonly size:number;
  slice(start?:number,end?:number):SupportHandoverBlob;
  arrayBuffer():Promise<ArrayBuffer>;
}
export interface SupportHandoverReadOptions {
  signal?:AbortSignal;
  /** Trusted runtime adapter over the complete original blob; default uses bounded incremental SHA-256. */
  digestFile?:(blob:SupportHandoverBlob,signal?:AbortSignal)=>Promise<string>;
}
export type SupportHandoverRead=(path:string)=>Promise<SupportHandoverBlob>|SupportHandoverBlob;
export interface SupportHandoverVerification {
  handover:SupportOperatingHandover;files:SupportHandoverArtifact[];
  memberCount:number;bytes:number;verification:'COMPLETE_ORIGINAL_MEMBER_BYTES';
}
export function supportHandoverError(code:string,message:string):TypeError&{code:string};
export function supportHandoverPath(path:string):string;
export function supportHandoverJSON(value:unknown):string;
/** Full editable histories, source coverage and inventory only; verify actual companion files separately. */
export function inspectSupportOperatingHandover(value:unknown):Promise<SupportOperatingHandover>;
export function createSupportOperatingHandover(input:Omit<SupportOperatingHandover,'schema'|'returns'>&{returns?:SupportOperatingReturn[]}):Promise<SupportOperatingHandover>;
export function supportHandoverMembers(value:SupportOperatingHandover):SupportHandoverArtifact[];
/** Uses the original prefix-history engine; does not itself read an archive, persist a plan or mutate a case. */
export function receiveSupportOperatingHandover(value:SupportOperatingHandover,existing?:OperatingPlan|null):Promise<{plan:OperatingPlan;reused:boolean;addedRevisions:number;handover:SupportOperatingHandover}>;
export function supportHandoverFileIdentity(path:string,blob:SupportHandoverBlob,options?:SupportHandoverReadOptions):Promise<SupportHandoverArtifact>;
export function verifySupportOperatingHandover(value:SupportOperatingHandover,read:SupportHandoverRead,options?:SupportHandoverReadOptions):Promise<SupportHandoverVerification>;
export function renderSupportOperatingHandoverHTML(value:SupportOperatingHandover):Promise<string>;
