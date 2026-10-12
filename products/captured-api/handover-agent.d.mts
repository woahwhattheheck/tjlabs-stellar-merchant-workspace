import type { CapturedEditionSelection, CapturedReceivingDecisionInput, CapturedReceivingDecisionSaveInput,
  CapturedEditionFileReadInput, CapturedEditionFileRelease } from './handover-client.mjs';
import type { CapturedDraftForm, CapturedDraftResolutions } from './draft-reconciliation.mjs';
/** Typed commands for the original merchant handover companion. */
export type SHA256=string;
export type UUID=string;
export interface HandoverScope {workspace:string;expectedProductId:SHA256}
export interface Page {offset?:number;limit?:number}
export interface SnapshotPage extends Page {expectedSnapshot?:SHA256}
export interface SourceSelection {kind:'capture'|'refresh';id:SHA256;revision?:SHA256}
export interface PackageSelection {name:string;manifestSha256:SHA256}
export type HandoverJobRequest=
  | {id:UUID;command:'COMPARE';draftId:UUID;revision:SHA256;baselines:Record<string,string|null>}
  | {id:UUID;command:'PREPARE'|'INSPECT'|'REVIEW';draftId:UUID;revision:SHA256}
  | {id:UUID;command:'PUBLISH'|'RECEIVE';sourceJob:UUID;reviewSha256:SHA256}
  | {id:UUID;command:'IMPORT';uploadId:UUID}
  | {id:UUID;command:'REOPEN';operationId:SHA256};
export interface ArchiveSelection {id:UUID;expectedSha256:SHA256;expectedBytes:number}
export interface HandoverToolArguments {
  merchant_handover_workspaces:Record<string,never>;
  merchant_handover_info:{workspace:string;expectedProductId?:SHA256};
  merchant_handover_inventory:HandoverScope & SnapshotPage & {view?:'summary'|'packages'|'sources'};
  merchant_handover_drafts:HandoverScope & Page & {kind?:'OUTGOING'|'RECEIVING'};
  merchant_handover_draft:HandoverScope & SnapshotPage & {id:UUID;revision?:SHA256;
    view?:'summary'|'form'|'history'|'packages'|'sources'|'names'};
  merchant_handover_draft_create:HandoverScope & {id:UUID;kind:'OUTGOING'|'RECEIVING';label:string};
  merchant_handover_selection_save:HandoverScope & {id:UUID;requestId:UUID;expectedRevision:SHA256;
    label:string;packages:PackageSelection[];sources:SourceSelection[]};
  merchant_handover_receiving_save:HandoverScope & {id:UUID;requestId:UUID;expectedRevision:SHA256;
    label:string;importJob:UUID;expectedManifestSha256:SHA256;names:Record<string,string>};
  merchant_handover_merge_review:HandoverScope & SnapshotPage & {id:UUID;baseRevision:SHA256;
    working:CapturedDraftForm;resolutions?:CapturedDraftResolutions;expectedCurrentRevision?:SHA256;
    view?:'summary'|'conflicts'|'changes'|'form'};
  merchant_handover_merge_save:HandoverScope & {id:UUID;requestId:UUID;baseRevision:SHA256;
    expectedRevision:SHA256;working:CapturedDraftForm;resolutions?:CapturedDraftResolutions;reviewSha256:SHA256};
  merchant_handover_working_export:HandoverScope & {id:UUID;baseRevision:SHA256;working:CapturedDraftForm};
  merchant_handover_working_import:HandoverScope & {content:string;expectedSha256?:SHA256};
  merchant_handover_editions:HandoverScope & CapturedEditionSelection;
  merchant_handover_edition_review:HandoverScope & CapturedReceivingDecisionInput;
  merchant_handover_edition_save:HandoverScope & CapturedReceivingDecisionSaveInput;
  merchant_handover_edition_file:HandoverScope & CapturedEditionFileReadInput;
  merchant_handover_edition_file_release:HandoverScope & CapturedEditionFileRelease;
  merchant_handover_jobs:HandoverScope & Page;
  merchant_handover_job:HandoverScope & SnapshotPage & {id:UUID;
    view?:'summary'|'selection'|'packages'|'sources'|'names'};
  merchant_handover_job_start:HandoverScope & {request:HandoverJobRequest};
  merchant_handover_job_resume:HandoverScope & {id:UUID;requestSha256:SHA256};
  merchant_handover_document:HandoverScope & Page & {id:UUID;view?:'summary'|'packages'|'sources'|'files'};
  merchant_handover_uploads:HandoverScope & Page;
  merchant_handover_upload_status:HandoverScope & {id:UUID};
  merchant_handover_archive:HandoverScope & ArchiveSelection;
  merchant_handover_archive_read:HandoverScope & ArchiveSelection & {offset?:number;limit?:number};
  merchant_handover_transfer:HandoverScope & ArchiveSelection & {
    fromWorkspace:string;fromProductId:SHA256;uploadId:UUID};
  merchant_handover_received:HandoverScope & Page;
}
export interface HandoverSummary {
  configured:boolean;ownership:'EXISTING_CAPTURED_PRODUCT';
  workspaces:Array<{workspace:string;label:string;projectsDirectory:string}>;
  activeCalls:number;closing:boolean;
}
export interface ScopedHandoverResult {
  workspace:string;productId:SHA256;native:Record<string,unknown>;
}
export interface HarWorkspaceDefinition {
  label:string;projectsDirectory:string;consoleUrlEnv?:string;consoleUrlFile?:string;
  [key:string]:unknown;
}
export interface HandoverMerchantConfiguration {
  harWorkspaces?:{workspaces:Record<string,HarWorkspaceDefinition>}|null;
  [key:string]:unknown;
}
export declare class MerchantCapturedHandovers {
  constructor(config:HandoverMerchantConfiguration,options?:{environment?:Record<string,string|undefined>});
  readonly summary:HandoverSummary;
  call<K extends keyof HandoverToolArguments>(name:K,args:HandoverToolArguments[K]):
    Promise<K extends 'merchant_handover_workspaces'?HandoverSummary:ScopedHandoverResult>;
  close():Promise<void>;
}
