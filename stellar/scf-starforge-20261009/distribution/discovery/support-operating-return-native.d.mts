import type {OperatingPlan} from './operating-plan.mjs';
import type {SupportOperatingArtifact,SupportOperatingSource,RecordSupportOperatingResultOptions} from './support-operating-plan.mjs';
export interface RecordSupportOperatingWorkFromSourceOptions extends Omit<RecordSupportOperatingResultOptions,'source'> {
  directory:string;expectedSource:SupportOperatingArtifact & {path:'SOURCE.json'};savedAt:string;signal?:AbortSignal;
}
export interface SupportOperatingWorkSourceResult {
  schema:'stellar-forge.oauth-support-operating-work-source.v1';source:SupportOperatingSource;
  sourceFile:SupportOperatingArtifact & {path:'SOURCE.json'};
  manifestFile:SupportOperatingArtifact & {path:'MANIFEST.json'};plan:OperatingPlan;
}
/** Reuses original full SF74 source-package inspection and reads only exact selected artifact bytes.
 * No new capture, case mutation, server, OAuth request or receiving operation is performed. */
export function recordSupportOperatingWorkFromSource(plan:OperatingPlan,options:RecordSupportOperatingWorkFromSourceOptions):Promise<SupportOperatingWorkSourceResult>;
