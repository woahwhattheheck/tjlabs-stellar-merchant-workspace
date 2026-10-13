import type {OperatingPlan} from './operating-plan.mjs';
import type {SupportOperatingReturn} from './support-operating-return.mjs';
import type {SupportOperatingHandover,SupportHandoverArtifact} from './support-operating-handover.mjs';
export interface SupportHandoverNativeSource {directory:string;expectedSource:SupportHandoverArtifact}
export interface SupportHandoverPackOptions {
  directory:string;id:string;title:string;owner:string;createdAt:string;plan:OperatingPlan;
  returns?:SupportOperatingReturn[];companions:SupportHandoverNativeSource[];signal?:AbortSignal;
}
export interface SupportHandoverPackResult {
  schema:'stellar-forge.support-operating-handover-packed.v1';
  directory:string;requestFile:SupportHandoverArtifact;archiveFile:SupportHandoverArtifact;
  documentFile:SupportHandoverArtifact;receiptFile:SupportHandoverArtifact;
  plan:{id:string;revisions:number};sources:Array<{sourceIndex:number;sourceFile:SupportHandoverArtifact;manifestFile:SupportHandoverArtifact;case:{id:string;revision:string}}>;
  memberCount:number;memberBytes:number;verification:'COMPLETE_ORIGINAL_MEMBER_BYTES';
  sourceVerification:'ORIGINAL_SOURCE_INSPECTOR_AT_EXPORT';handover:SupportOperatingHandover;
}
export function packSupportOperatingHandover(options:SupportHandoverPackOptions):Promise<SupportHandoverPackResult>;
export function inspectSupportOperatingHandoverArchive(options:{archive:string;expectedArchive?:SupportHandoverArtifact;signal?:AbortSignal}):Promise<{
  schema:'stellar-forge.support-operating-handover-inspected.v1';archiveFile:SupportHandoverArtifact;documentFile:SupportHandoverArtifact;
  handover:SupportOperatingHandover;files:SupportHandoverArtifact[];memberCount:number;memberBytes:number;verification:'COMPLETE_ORIGINAL_MEMBER_BYTES';
}>;
export interface SupportHandoverReceiveOptions {
  archive:string;directory:string;expectedArchive:SupportHandoverArtifact;existingPlan?:OperatingPlan|null;signal?:AbortSignal;
}
export interface SupportHandoverReceiveResult {
  schema:'stellar-forge.support-operating-handover-received.v1';directory:string;
  requestFile:SupportHandoverArtifact;archiveFile:SupportHandoverArtifact;documentFile:SupportHandoverArtifact;
  planFile:SupportHandoverArtifact;receiptFile:SupportHandoverArtifact;
  plan:OperatingPlan;handover:SupportOperatingHandover;reusedPlan:boolean;addedRevisions:number;
  companions:Array<{sourceIndex:number;sourceFile:SupportHandoverArtifact;manifestFile:SupportHandoverArtifact;receiptFile:SupportHandoverArtifact;case:{id:string;revision:string};caseRevisions:number}>;
  verification:'FULL_ORIGINAL_CASE_HISTORY_AND_ARTIFACTS';liveCaseHeadChanged:false;
}
export function receiveSupportOperatingHandoverArchive(options:SupportHandoverReceiveOptions):Promise<SupportHandoverReceiveResult>;
