/// <reference types="node" />
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export interface Connection {
 schema: 'tjl.economic-client-connection.v1';
 base_url: string; token: string; project_directory: string; process_id: number;
}
export interface SourceSelection {
 dataset: {agencyid:string;id:string;version:string};
 release: {kind:'latest'|'timestamp'|'description'|'unreleased';value?:string};
 series_keys?: string[]; start?: string; end?: string; hist_obs?: boolean;
}
export interface SourceRights {
 citation:string; terms:string; customer_use:string; source_url:string; access_basis:string; notes?:string;
}
export interface SelectedSeries {
 capture_id:string; series_id:string; title:string;
 role:'observed'|'forecast'|'mixed'|'unclassified'; frequency:string; units:string;
 adjustment?:string; methodology?:string; interpretation?:string; start?:string; end?:string;
}
export interface BriefingDraft {
 title:string; audience:string; prepared_by?:string; summary?:string; editorial_notes?:string;
 series:SelectedSeries[]; rights:Record<string,SourceRights>; companion_ids:string[];
}
export interface FileIdentity {path:string;sha256:string;bytes:number}
export interface BriefingEdition {
 id:string;revision:number;title:string;created_at:string;files:Record<string,FileIdentity>;report?:Json;
}
export interface WorkspaceState {
 schema:'tjl.economic-client-workspace.v1';project_id:string;label:string;revision:number;config:Json;
 draft:BriefingDraft|null;captures:Json[];registries:string[];companions:Json[];briefings:BriefingEdition[];
 active_briefing:string|null;requests:Json[];reviews:ReviewState;
}
export interface ReviewPackage {
 id:string;operation_id:string;project_id:string;briefing_id:string;review_id:string;recipient:string;label:string;created_at:string;
 files:Record<string,FileIdentity & {content_type:string}>;
}
export interface ReviewReturn {
 id:string;package_id:string;review_id:string;edition_id:string;summary:Json;received_at:string;document:FileIdentity;
}
export interface ReviewResolution {
 id:string;return_id:string;package_id:string;revision:number;created_at:string;decisions:Json[];document:FileIdentity;
}
export interface ReviewState {packages:ReviewPackage[];returns:ReviewReturn[];resolutions:ReviewResolution[]}
export interface ReviewChoice {
 target_id:string;current_sha256:string;action:'take_proposal'|'acknowledge'|'defer'|'reject';reason:string;confirm_conflict?:boolean;
}
export interface Client {
 action(action:'review-create',input:{briefing_id:string;recipient:string;label:string},operation_id:string):Promise<ReviewPackage>;
 action(action:'review-preview',input:{return_id:string}):Promise<Json>;
 action(action:'review-resolve',input:{return_id:string;expected_revision:number;comparison_sha256:string;decisions:ReviewChoice[]},operation_id:string):Promise<ReviewResolution>;
 reviewFile(id:string,name:'review.html'|'review.json'):Promise<{body:Buffer;content_type:string|null}>;
 reviewReturnFile(id:string):Promise<{body:Buffer;content_type:string|null}>;
 receiveReview(body:Uint8Array,operationId:string):Promise<ReviewReturn>;
 state():Promise<WorkspaceState>;
 action(action:'capture',input:SourceSelection,operation_id:string):Promise<Json>;
 action(action:'save-briefing'|'save-draft',input:{expected_revision:number;draft:BriefingDraft},operation_id:string):Promise<Json>;
 action(action:string,input?:Json,operation_id?:string):Promise<Json>;
 exportProject():Promise<{body:Buffer;content_type:string|null}>;
 importProject(body:Uint8Array):Promise<WorkspaceState>;
 reportFile(id:string,name:'briefing.html'|'briefing.json'|'observations.csv'|'SOURCE_RIGHTS.json'):Promise<{body:Buffer;content_type:string|null}>;
 companionFile(id:string,name:string):Promise<{body:Buffer;content_type:string|null}>;
}
export function readConnection(path:string):Promise<Connection>;
export function createClient(options:{baseUrl:string;token:string;fetchImpl?:typeof fetch;timeoutMs?:number}):Client;
