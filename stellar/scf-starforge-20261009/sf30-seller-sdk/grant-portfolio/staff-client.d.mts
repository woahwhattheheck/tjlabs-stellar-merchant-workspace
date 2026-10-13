/** Original native staff programme and source contracts; no separate transport. */
export type Sha256 = string;
export type NativeGuid = string;
export type StaffAction = 'initialize'|'evidence.record'|'data-management.review'|'validation.record'|
  'gate0.decide'|'design.submit'|'qa.clearance'|'qa.decide'|'qa.withdraw'|'condition.resolve'|
  'correction.open'|'correction.resolve'|'design.reopen'|'financial.review'|'corporate.reference';
export type StaffPhase = 'IDEA'|'FORMULATION'|'QA_SUBMITTED'|'APPRAISED'|'CLOSED_PIPELINE';
export interface PortfolioBinding {id:string; revision:number; snapshot:Sha256;}
export interface SourceReference {sourceId:Sha256; entityKey:Sha256; sha256:Sha256;}
export interface PortfolioPointers {id_pointer:string; revision_pointer:string; snapshot_pointer:string;}
export interface ReviewedSource {actor:string; at:string; reason:string; source_refs:Record<string,unknown>[];}
export interface StaffNativePosition {
  row_version:string; state_version:number; source_sha256:Sha256; state_sha256:Sha256;
}
export interface StaffProgrammeStep {
  key:string; actor:string; action:StaffAction; payload:Record<string,unknown>;
  expected_phase:StaffPhase; note:string;
}
export interface StaffProgrammeProject {
  key:string; label:string; classification:'CCS'; source:SourceReference;
  entity:string; record_id:NativeGuid; source_reference_pointer:string;
  initial:StaffNativePosition; steps:StaffProgrammeStep[];
}
export interface StaffProgrammeFlagship {
  label:string; classification:'Climate Change Flagship'; source:SourceReference;
  actor:string; entity_set:string; record_id:NativeGuid; source_field:string;
  source_reference_pointer:string; portfolio_binding:PortfolioPointers;
  members_pointer:string; members:SourceReference[]; expected_source_sha256:Sha256;
}
export interface StaffProgramme {
  schema:'tjlabs.pmrs.staff-programme/v1'; id:NativeGuid; title:string; policy_sha256:Sha256;
  actors:Record<string,{user_id:NativeGuid; label:string}>;
  projects:StaffProgrammeProject[]; flagship:StaffProgrammeFlagship; review:ReviewedSource;
}
/** Encode precise numeric payloads as original JSON, not unsafe JS number conversions. */
export interface ProgrammeActionInput {
  operationId:string; expectedRevision?:number; actor:string; portfolio:PortfolioBinding;
  programmeObject:Sha256; profileIds:Record<string,string>;
}
export interface CaptureActionInput {
  operationId:string; expectedRevision?:number; actor:string; portfolio:PortfolioBinding;
  profileId:string; entity:string; projectRecordId:NativeGuid;
  commandOperationId:NativeGuid; historyStateVersion:number;
}
export interface NativeActionResult {
  id:string; kind:'staff-programme'|'staff-history'; sha256:Sha256; state:string;
  portfolio:PortfolioBinding;
}
export interface OriginalRequest {
  id:string; state:'RUNNING'|'COMPLETED'|'FAILED'; result?:NativeActionResult|null;
  [key:string]:unknown;
}
export interface RequestOptions {signal?:AbortSignal;}
export interface StaffClient {
  action(input:{operationId:string; action:'dataverse.staff.programme'|'dataverse.staff.capture';
    payload:Record<string,unknown>; expectedRevision?:number}, options?:RequestOptions):Promise<OriginalRequest>;
  resume(operationId:string, options?:RequestOptions):Promise<OriginalRequest>;
}
export declare function runStaffProgramme(client:StaffClient, input:ProgrammeActionInput, options?:RequestOptions):Promise<OriginalRequest>;
export declare function captureStaffHistory(client:StaffClient, input:CaptureActionInput, options?:RequestOptions):Promise<OriginalRequest>;
export declare function resumeStaffOperation(client:StaffClient, operationId:string, options?:RequestOptions):Promise<OriginalRequest>;
