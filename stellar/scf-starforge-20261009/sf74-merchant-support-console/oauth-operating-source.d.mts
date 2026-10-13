import type {SupportOperatingArtifact,SupportOperatingSource} from '../distribution/discovery/support-operating-plan.mjs';

export const OAUTH_OPERATING_PACKAGE_SCHEMA:'stellar-forge.oauth-support-operating-package.v1';
export const OAUTH_OPERATING_SOURCE_FILE:'SOURCE.json';
export const OAUTH_OPERATING_MANIFEST_FILE:'MANIFEST.json';
export const MAX_OPERATING_DESCRIPTOR_BYTES:number;
export const MAX_OPERATING_PACKAGE_BYTES:number;
/** Complete existing private file, selected before capture; no fetch or execution. */
export interface OAuthOperatingExternalArtifact {file:string;bytes:number;sha256:string}
export interface OAuthOperatingEvidenceInput extends OAuthOperatingExternalArtifact {role:string}
export interface CaptureOAuthOperatingSourceOptions {
  /** Absolute private original CaseStore directory. */
  casesDirectory:string;
  /** Actual original UUIDv4 and selected immutable 64-hex revision. */
  caseId:string;
  revision:string;
  /** Separate absolute private selection directory, empty or the same retained operation. */
  outputDirectory:string;
  sourceId:string;
  /** Exact ISO UTC time, retained unchanged when recovering this request. */
  capturedAt:string;
  incidentSource?:{id:string;configurationRevision:string}|null;
  nativeDelivery?:OAuthOperatingExternalArtifact|null;
  evidence?:OAuthOperatingEvidenceInput[];
  signal?:AbortSignal;
}
export interface OAuthOperatingPackageResult {
  source:SupportOperatingSource;
  sourceFile:SupportOperatingArtifact & {path:'SOURCE.json'};
  manifestFile:SupportOperatingArtifact & {path:'MANIFEST.json'};
  reused:boolean;
  /** Immutable snapshot in the original CaseStore layout; no live head is changed. */
  caseSnapshotDirectory:string;
  selectedRevision:string;
  receiving:'ORIGINAL_CASE_SNAPSHOT_VERIFIED';
  liveCaseAction:string;
}
export interface InspectOAuthOperatingSourcePackageOptions {
  directory:string;
  /** External identity of the selected compact descriptor. */
  expectedSource:SupportOperatingArtifact & {path:'SOURCE.json'};
  signal?:AbortSignal;
}
export interface ReceiveOAuthOperatingSourceOptions {
  sourceDirectory:string;
  destination:string;
  expectedSource:SupportOperatingArtifact & {path:'SOURCE.json'};
  signal?:AbortSignal;
}
export interface ReceiveOAuthOperatingSourceResult extends OAuthOperatingPackageResult {
  receiptFile:SupportOperatingArtifact & {path:'RECEIVED.json'};
}
/** Retains every selected ancestor, exact original bytes and actual returned evidence.
 * Uses original CaseStore validation, runtime codecs, immutable artifact writer and kernel lease.
 * Does not execute OAuth, create an observation, change a case or infer a completed operating step. */
export function captureOAuthOperatingSource(options:CaptureOAuthOperatingSourceOptions):Promise<OAuthOperatingPackageResult>;
/** Verifies complete original lineage and artifact hashes; reopens each revision with CaseStore. */
export function inspectOAuthOperatingSourcePackage(options:InspectOAuthOperatingSourcePackageOptions):Promise<OAuthOperatingPackageResult>;
/** Receives a complete immutable companion and reuses an exact terminal receipt.
 * A complete retained destination can close a lost acknowledgement without the sender directory.
 * Continue a live case through its existing Support handoff/import and current-revision save. */
export function receiveOAuthOperatingSource(options:ReceiveOAuthOperatingSourceOptions):Promise<ReceiveOAuthOperatingSourceResult>;
