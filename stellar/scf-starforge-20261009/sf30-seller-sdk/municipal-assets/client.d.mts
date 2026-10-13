import type { Buffer } from 'node:buffer';
export type Json = null | boolean | number | string | Json[] | { [key:string]:Json };
export type DatasetKind = 'source_assets'|'target_assets'|'locations'|'requests'|'work_orders'|'returns';
export type InputKind = DatasetKind|'roundtrips';
export type InputFormat = 'csv'|'json'|'jsonl'|'geojson'|'esri-json'|'belleville-capture'|'maximo-target';
export type ProjectMode = 'development'|'vendor-authorized'|'public-reference';
export interface ManagedRequest { command:'municipal-assets'; args:string[]; releaseDirectory:string; [key:string]:unknown; }
export interface StartupRecord {
  schema:'stellar-forge.municipal-asset-startup.v1'; status:'MUNICIPAL_ASSET_READY'; url:string;
  binding:{schema:string;directory:string;workspace:{id:string;[key:string]:Json};database:{path:string;dev:string;ino:string};[key:string]:Json};
  bindingSha256:string;sourceSha256:string;sourceRoot:string;passwordFile:string;
  requestedPort:number;port:number;instanceId:string;pid:number;startedMs:number;
}
export interface HostInput { label:string;path:string;sha256:string;kind:InputKind|'maximo-result';format:InputFormat; }
export interface WorkspaceConfiguration {
  label:string;actor:string;request:ManagedRequest;startup:StartupRecord;operationDirectory:string;
  inputs:Record<string,HostInput>;
}
export interface HostConfiguration {schema:'stellar-forge.municipal-asset-host.v1';path:string;workspaces:Record<string,WorkspaceConfiguration>;}
export interface Identity {url:string;binding:StartupRecord['binding'];bindingSha256:string;sourceSha256:string;instanceId:string;pid:number;actor:string;}
export interface Project {id:string;title:string;mode:ProjectMode;revision:number;created_at:number;}
export interface Mutation { requestId:string;projectId:string;expectedRevision:number; }
export interface MutationResult { project_id:string;revision:number;action:string;[key:string]:Json; }
export interface Mapping { fields:Record<string,string>;status_aliases?:Record<string,string>;trim_ids?:boolean; }
export interface Settings {
  comparison_fields:Array<'label'|'status'|'parent_id'|'location_id'|'geometry'|'updated_at'|'attributes'>;
  transitions:Record<string,string[]>;
  attestation:{supplier_reviewer:string;city_data_authorization_ref:string;vendor_sow_ref:string};
  expected_source_rows:number|null;expected_target_rows:number|null;expected_correlation_ids?:string[];
}
export interface Actions {
  mapping:{kind:DatasetKind;mapping:Mapping};
  select_input:{kind:InputKind;input_id:string|null;reason:string};
  settings:{settings:Settings};
  review:{finding_id:string;decision:'repair_requested'|'reviewed'|'keep_separate';note:string};
  exclude:{asset_id:string;reason:string;remove?:boolean};
  repair:{kind:DatasetKind;row_number:number;field:string;value:string;reason:string};
  request_status:{work_order_id:string;desired_status:string;note:string};
  apply_returns:Record<never,never>;
  withdraw_change:{change_id:string;reason:string};
  native_check:Record<never,never>;
  release:{note:string};
  restore_revision:{target_revision:number;reason:string};
}
export interface RecordSelection {
  projectId:string;expectedRevision:number;kind:DatasetKind;query?:string;page?:number;pageSize?:number;recordId?:string;
}
export interface RecordPage {kind:DatasetKind;page:number;total:number;page_size:number;rows:Array<Record<string,Json>>;revision:number;}
export interface ProjectSnapshot {
  project:Project & {state:Record<string,Json>};inputs:Array<Record<string,Json>>;counts:Record<DatasetKind,number>;
  errors:number;warnings:number;findings:Array<Record<string,Json>>;history:Array<Record<string,Json>>;
  releases:Array<Record<string,Json>>;native_runs:Array<Record<string,Json>>;kinds:Record<DatasetKind,string[]>;required:Record<DatasetKind,string[]>;
}
export interface MaximoMapping {
  action:'Add'|'Update';fields:Record<string,string>;constants?:Record<string,null|boolean|number|string>;
  source_ids?:string[]|null;allornothing:boolean;review_reference:string;
}
export type FileSelection =
  | {kind:'project'|'report';projectId:string;expectedRevision:number}
  | {kind:'export';projectId:string;expectedRevision:number;releaseId?:string}
  | {kind:'backup'}
  | {kind:'refresh-status'|'maximo-status';projectId:string}
  | {kind:'refresh';projectId:string;operationId:string;name:'capture'|'source_archive'|'report'|'handoff'|'workspace'|'geometry'|'result'}
  | {kind:'maximo-capture'|'maximo-load'|'maximo-result';projectId:string;operationId:string}
  | {kind:'operation';requestId:string};
export interface OriginalFile {name:string;type:string;bytes:Buffer;}
export interface OperationSummary {
  schema:string;requestId:string;state:'PREPARED'|'INVOKING'|'CONTINUE_ORIGINAL_REQUEST'|'COMPLETED'|'RETURNED';
  binding:{bindingSha256:string;actor:string;workspaceId:string};createdAt:string;
  request:{method:'POST';path:string;headers:Record<string,string>;bytes:number;sha256:string};
  response:null|{status:number;contentType:string;bytes:number;sha256:string;receivedAt:string};
  attempts:Array<Record<string,Json>>;
}
export function readMunicipalAssetConfiguration(path:string):Promise<HostConfiguration>;
export function readMunicipalAssetInput(entry:WorkspaceConfiguration,alias:string,expectedSha256?:string):Promise<{input:HostInput;bytes:Buffer;name:string;sha256:string}>;
export class MunicipalAssetClient {
  private constructor();
  static open(entry:WorkspaceConfiguration):Promise<MunicipalAssetClient>;
  readonly identity:Identity;
  status():Promise<Identity & {projects:Project[]}>;
  project(projectId:string,expectedRevision:number):Promise<ProjectSnapshot>;
  records(input:RecordSelection):Promise<RecordPage>;
  createProject(input:{requestId:string;title:string;mode:ProjectMode}):Promise<{id:string;revision:number}>;
  importInput(input:Mutation & {kind:InputKind;format:InputFormat;name:string;bytes:Buffer}):Promise<MutationResult>;
  action<K extends keyof Actions>(name:K,input:Mutation & Actions[K]):Promise<MutationResult>;
  saveMapping(input:Mutation & Actions['mapping']):Promise<MutationResult>;
  selectInput(input:Mutation & Actions['select_input']):Promise<MutationResult>;
  saveSettings(input:Mutation & Actions['settings']):Promise<MutationResult>;
  review(input:Mutation & Actions['review']):Promise<MutationResult>;
  exclude(input:Mutation & Actions['exclude']):Promise<MutationResult>;
  proposeRepair(input:Mutation & Actions['repair']):Promise<MutationResult>;
  requestStatus(input:Mutation & Actions['request_status']):Promise<MutationResult>;
  applyReturns(input:Mutation):Promise<MutationResult>;
  withdrawChange(input:Mutation & Actions['withdraw_change']):Promise<MutationResult>;
  nativeCheck(input:Mutation):Promise<MutationResult>;
  release(input:Mutation & Actions['release']):Promise<MutationResult & {release_id:string}>;
  restoreRevision(input:Mutation & Actions['restore_revision']):Promise<MutationResult>;
  refreshStatus(projectId:string):Promise<{refreshes:Json[]}>;
  refreshStart(input:Mutation & {pageWidth?:number;geometryWidth?:number;sourceOperation?:string}):Promise<Record<string,Json>>;
  refreshResume(input:{requestId:string;projectId:string;refreshOperation:string}):Promise<Record<string,Json>>;
  maximoStatus(projectId:string):Promise<{profiles:Json[];captures:Json[];loads:Json[]}>;
  maximoStart(input:Mutation & {profileId:string}):Promise<Record<string,Json>>;
  maximoResume(input:{requestId:string;projectId:string;captureOperation:string}):Promise<Record<string,Json>>;
  maximoReceive(input:Mutation & {captureOperation:string}):Promise<MutationResult>;
  maximoPrepareLoad(input:Mutation & {captureOperation:string;mapping:MaximoMapping}):Promise<{id:string;rows:number;body_sha256:string}>;
  maximoReceiveLoad(input:{requestId:string;projectId:string;loadId:string;returnedBytes:Buffer}):Promise<{load_id:string;receive_id:string;rows:number;findings:Json[]}>;
  maximoResult(input:{projectId:string;operationId:string;offset?:number;limit?:number}):Promise<Record<string,Json>>;
  operation(requestId:string):Promise<OperationSummary>;
  replayOperation(requestId:string):Promise<Json>;
  originalFile(selection:FileSelection):Promise<OriginalFile>;
  close():Promise<void>;
}
