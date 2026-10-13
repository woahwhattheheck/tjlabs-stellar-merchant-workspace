// SPDX-License-Identifier: MIT
import type {Buffer} from 'node:buffer';
import type {GrantJsonResponse,GrantNativeResponse,GrantObject} from './agent-client.mjs';
export const ECONDB_SOURCE_DESK_SCHEMA:'stellar-forge.econdb-source-desk.v1';
export const ECONDB_SOURCE_DESK_MAX_FILE:number;
export type EcondbSourceKind='archive'|'seed'|'bindings'|'commissioning'|'attachment';
export interface EcondbSourceFile extends GrantObject {
 fileId:string;kind:string;name:string;bytes:number;sha256:string;schema:string;
 /** Download-only aliases. No host filesystem path is exposed. */
 id?:string;filename?:string;
}
export interface EcondbSourceRequest extends GrantObject {requestId:string}
export interface EcondbSourceCatalogueInput extends EcondbSourceRequest {archiveId:string}
export interface EcondbSourceInspectionInput extends EcondbSourceCatalogueInput {
 projectId:string;projectRevision:number;expectedInputSha256:string;
}
export interface EcondbSourceTemplateInput extends EcondbSourceRequest {
 inspectionId:string;seedId:string;commissioningId:string;nativeCaseId:string;
 /** Capture once with the original request UUID; retain on uncertain replay. */
 expectedVersion:number;
}
export interface EcondbSourcePreparationInput extends EcondbSourceTemplateInput {
 bindingsId:string;attachments?:Array<{fileId:string;name:string;purpose:string}>;
}
export interface EcondbSourceResult extends GrantObject {
 schema:'stellar-forge.econdb-installation-preparation-service.v1.result';
 type:string;requestId:string;caseId?:string;files:EcondbSourceFile[];
 /** Complete original Python-facing input, including the retained case version. */
 request?:EcondbSourceRequest;
 nativeRequest?:GrantObject|null;
 status?:'COMPLETE';
}
export interface EcondbSourceCatalogue extends EcondbSourceResult {
 archiveId:string;archive:GrantObject;workspaceId:string;projects:GrantObject[];completeArchiveSummary:GrantObject;
}
export interface EcondbSourceTemplate extends EcondbSourceResult {
 inspectionId:string;seedId:string;commissioningId:string;nativeCaseId:string;bindings:GrantObject;
 seed:GrantObject;profile:GrantObject;commercial:GrantObject;source:GrantObject;
}
export interface EcondbSourcePreparation extends EcondbSourceResult {
 inspectionId:string;nativeCaseId:string;archiveId:string;archive:GrantObject;
 source:GrantObject;workshareCaseId:string;preparationSha256:string;
 installation:{source:GrantObject;workshareCaseId:string;document:GrantObject;preview:GrantObject;selections:GrantObject};
 nativeSource?:GrantObject;nativePreview?:GrantObject|null;requiresCurrentPreview?:boolean;
 readyReceiving?:{expectedPreparationSha256:string};
}
export interface EcondbSourcePending extends GrantObject {
 schema:'stellar-forge.econdb-installation-preparation-service.v1.pending';
 requestId:string;status:'NOT_RECORDED'|'PENDING';type?:string;request:EcondbSourceRequest|null;
 files?:EcondbSourceFile[];
}
export interface EcondbSourceList extends GrantObject {
 offset:number;limit:number;total:number;nextOffset:number|null;
 rows:Array<{requestId:string;type:string;status:'PENDING'|'COMPLETE';request:EcondbSourceRequest;files:EcondbSourceFile[]}>;
}
export interface EcondbSourceInputs {
 import:{caseId:string;requestId:string;kind:EcondbSourceKind;name:string;bytes:Buffer|Uint8Array;sha256:string};
 catalogue:{caseId:string;body:EcondbSourceCatalogueInput};
 inspect:{caseId:string;body:EcondbSourceInspectionInput};
 template:{caseId:string;body:EcondbSourceTemplateInput};
 prepare:{caseId:string;body:EcondbSourcePreparationInput};
 request:{caseId:string;requestId:string};
 'archive-describe':{caseId:string;requestId:string};
 list:{caseId:string;offset?:number;limit?:number};
 file:{caseId:string;fileId:string;expectedSha256:string};
 'file-describe':{caseId:string;fileId:string};
 'source-file':{caseId:string;inspectionId:string;path:string;expectedSha256:string};
 'source-file-describe':{caseId:string;inspectionId:string;path:string};
}
export interface EcondbSourceResponses {
 import:GrantJsonResponse<EcondbSourceResult & {file:EcondbSourceFile}>;
 catalogue:GrantJsonResponse<EcondbSourceCatalogue>;
 inspect:GrantJsonResponse<EcondbSourceResult>;
 template:GrantJsonResponse<EcondbSourceTemplate>;
 prepare:GrantJsonResponse<EcondbSourcePreparation>;
 request:GrantJsonResponse<EcondbSourceResult|EcondbSourcePending>;
 'archive-describe':GrantJsonResponse<EcondbSourceFile>;
 list:GrantJsonResponse<EcondbSourceList>;
 file:GrantNativeResponse;
 'file-describe':GrantJsonResponse<EcondbSourceFile>;
 'source-file':GrantNativeResponse;
 'source-file-describe':GrantJsonResponse<EcondbSourceFile>;
}
export interface EcondbSourcePlan<K extends keyof EcondbSourceInputs=keyof EcondbSourceInputs> {
 action:K;input:EcondbSourceInputs[K];route:string;options:GrantObject;
}
export function planEcondbSourceOperation<K extends keyof EcondbSourceInputs>(action:K,input:EcondbSourceInputs[K]):EcondbSourcePlan<K>;
export function performEcondbSourceOperation<K extends keyof EcondbSourceInputs>(plan:EcondbSourcePlan<K>,
 send:(route:string,options:GrantObject)=>Promise<GrantNativeResponse>):Promise<EcondbSourceResponses[K]>;
