// SPDX-License-Identifier: MIT
/** IDs and hashes are the complete 64-character values returned by the original workspace. */
export type Identity = string;
export type Json = null | boolean | number | string | Json[] | {[key:string]:Json};
export type Document = {[key:string]:Json};
export type Family = 'project' | 'tasks' | 'resources' | 'assignments' | 'dependencies' | 'calendars';
export interface FileReference {sha256:Identity;bytes:number;filename:string;path?:string;schema?:string}
export interface SavedFile extends FileReference {path:string}
export interface PageSelection {cursor?:string;limit?:number}
export interface RowSelection {family?:Exclude<Family,'project'>;offset?:number;limit?:number}
export interface CompanionProfile {format?:string;role?:string;encoding?:string;delimiter?:string;json_pointer?:string}
export interface CompanionInput {source:FileReference;label?:string;profile?:CompanionProfile}
export interface ReviewDecision {reviewer:string;note:string}
export interface RevisionSelection {expected_revision:number}
export interface DeploymentSelection {deployment_id:Identity}
export interface CohortSelection {cohort_id:Identity}
export interface PublicationSelection extends CohortSelection {publication_id:Identity}
export interface IntakeArguments {source:FileReference;label?:string;profile?:Document;companions?:CompanionInput[]}
export interface SourceReviewArguments {edition_id:Identity;target_profile:Document;mappings?:Document;decisions?:Json;corrections?:Json}
export interface PrepareArguments {
 edition_id:Identity;profile_id:string;probe_sha256?:Identity;mappings?:Document;export_profile?:Document;
 decisions?:Json;corrections?:Json
}
export interface CohortMember {project_key:string;edition_id:Identity;label?:string;[key:string]:Json|undefined}
/** Local date/time strings follow the original project calendar, without a timezone conversion. */
export type TimephasedPeriod = {key:string;label?:string;start:string;finish:string};
export type TimephasedSeries = {name:string;field:string;kind:'work'|'money'|'material';units?:string};
export type TimephasedProfile = {
 schema:'portfolio.timephased-profile.v1';periods:TimephasedPeriod[];series:TimephasedSeries[]
};
export type ArchiveProfile = Document & {timephased?:TimephasedProfile};
export interface ArchiveSaveArguments {
 cohort_id?:Identity;expected_revision?:number;name:string;description?:string;members:CohortMember[];profile?:ArchiveProfile
}
export interface ArchivePublishArguments extends CohortSelection,RevisionSelection,ReviewDecision {
 review_sha256:Identity
}
export interface ArchiveQueryArguments extends PublicationSelection {sql:string;parameters?:Json[]|Document;limit?:number}
export interface ArchiveQueryExportArguments extends PublicationSelection {
 sql:string;parameters:Json[]|Document
}
export interface ActionArguments {
 intake:IntakeArguments;
 source_review:SourceReviewArguments;
 source_apply:{review_id:Identity};
 mspdi_export:{edition_id:Identity;profile?:Document};
 probe:{profile_id:string};
 prepare:PrepareArguments;
 prepare_adjustment:DeploymentSelection & RevisionSelection & {edition_id:Identity;mappings?:Document};
 review:DeploymentSelection & RevisionSelection & ReviewDecision & {accepted_findings?:string[]};
 continue:DeploymentSelection & {review_sha256:Identity;retry_rejected?:boolean};
 adopt_detail:DeploymentSelection & ReviewDecision & {
  review_sha256:Identity;call_key:string;detail_id:string;detail_sha256:Identity
 };
 capture_target:DeploymentSelection & RevisionSelection;
 receive_target_file:DeploymentSelection & RevisionSelection & {source:FileReference;profile?:Document;label?:string;identity_map?:Document};
 accept:DeploymentSelection & RevisionSelection & ReviewDecision & {comparison_sha256:Identity;exceptions?:string[]};
 handover:DeploymentSelection;
 archive:Record<string,never>;
 abandon_set:DeploymentSelection & RevisionSelection & ReviewDecision & {review_sha256:Identity;operation_set_id:string;retry_rejected?:boolean};
 archive_save:ArchiveSaveArguments;
 archive_review:CohortSelection & RevisionSelection;
 archive_publish:ArchivePublishArguments;
 archive_query_export:ArchiveQueryExportArguments;
 archive_inspect:{source:FileReference};
 archive_receive:ReviewDecision & {source:FileReference;manifest_sha256:Identity};
}
export type ActionKind = keyof ActionArguments;
export interface OriginalRequest {
 schema:string;id:Identity;request_id?:Identity;kind:ActionKind;state:'QUEUED'|'RUNNING'|'COMPLETE'|'FAILED';
 revision:number;arguments:Document;result?:Json;result_sha256?:Identity;
 error?:{code?:string;message?:string;[key:string]:Json|undefined};[key:string]:unknown
}
export interface ClientOptions {
 connectionFile:string;expectedWorkspaceId?:Identity;fetchImpl?:typeof fetch;signal?:AbortSignal
}
export interface ResponseOptions {
 method?:'GET'|'POST';query?:Record<string,string|number|boolean|string[]|undefined>;
 body?:unknown;requestId?:Identity;signal?:AbortSignal;maximum?:number
}
export const PROJECT_PORTFOLIO_ACTIONS:readonly ActionKind[];
export const MAX_SOURCE_BYTES:number;
export const MAX_ARCHIVE_BYTES:number;
export const MAX_JSON_BYTES:number;
export function newProjectPortfolioRequestId():Identity;
export function inspectProjectPortfolioFile(path:string,options?:{
 maximum?:number;expectedSha256?:Identity
}):Promise<SavedFile>;
export function readProjectPortfolioResponse(response:Response,maximum?:number):Promise<Uint8Array>;
export class ProjectPortfolioClient {
 constructor(options:ClientOptions);
 ready():Promise<Document>;
 requestJson(path:string,options?:ResponseOptions):Promise<any>;
 saveResponse(path:string,destination:string,options?:ResponseOptions):Promise<SavedFile>;
 state(query?:PageSelection):Promise<Document>;
 requests(query?:PageSelection):Promise<Document>;
 request(requestId:Identity,options?:{signal?:AbortSignal}):Promise<OriginalRequest>;
 editions(query?:PageSelection):Promise<Document>;
 edition(editionId:Identity,query?:RowSelection):Promise<Document>;
 sourceReview(reviewId:Identity):Promise<Document>;
 deployment(deploymentId:Identity):Promise<Document>;
 object(sha256:Identity):Promise<Json>;
 cohorts(query?:PageSelection):Promise<Document>;
 cohort(cohortId:Identity):Promise<Document>;
 archiveFields(editions:Identity[]):Promise<Document>;
 archiveTable(query:PublicationSelection & {
  table:string;offset?:number;limit?:number;filter_column?:string;filter_text?:string
 }):Promise<Document>;
 archiveQuery(body:ArchiveQueryArguments):Promise<Document>;
 companions(editionId:Identity):Promise<Document>;
 companionCapture(query:{edition_id:Identity;ordinal:number;offset?:number;limit?:number}):Promise<Document>;
 sourceFieldCatalogue(editionId:Identity,family:Extract<Family,'project'|'tasks'|'resources'|'assignments'>):Promise<Document>;
 action<K extends ActionKind>(requestId:Identity,kind:K,args:ActionArguments[K]):Promise<OriginalRequest>;
 resume(requestId:Identity,options?:{retryFailed?:boolean}):Promise<OriginalRequest>;
 pause(deploymentId:Identity,requestId:Identity):Promise<Document>;
 requestStatus(requestId:Identity,options?:{signal?:AbortSignal}):Promise<OriginalRequest>;
 waitRequest(requestId:Identity,options?:{intervalMs?:number;timeoutMs?:number;includeResult?:boolean}):Promise<OriginalRequest>;
 uploadFile(path:string,options?:{archive?:boolean;expectedSha256?:Identity;name?:string}):Promise<FileReference>;
 download(selection:{
  sha256?:Identity;requestId?:Identity;expectedSha256?:Identity;expectedBytes:number;name?:string
 },destination:string):Promise<SavedFile>;
 cancelWait(requestId:Identity):{requestId:Identity;cancelled:number};
 close():Promise<void>;
}
