export type Projection='laus'|'qcew';
export type PublisherProjection=Projection|'source_files';
export type OperationKind='capture'|'import'|'select'|'note'|'report'|'compare'|'regional'|'export'|'publisher-open'|'publisher-stop'|'receive'|'native-receive';
export type Filters=Record<string,Array<string|number>>;
export interface OperationRequest {
  id:string; kind:OperationKind; input:Record<string,unknown>; expected_revision:number;
}
export interface Operation {
  id:string;kind:OperationKind;input_hash:string;expected_revision:number;
  created:string;updated:string;state:'pending'|'running'|'complete'|'failed'|'interrupted';
  result:Record<string,unknown>|null;error:string|null;
}
export interface Page {offset:number;total:number;next_offset:number|null}
export interface Edition {
  id:string;created:string;title:string;capture_hash:string;source_hash:string;
  counts:Record<Projection,number>;selection:Record<string,unknown>;source_count:number;
}
export interface Report {id:string;created:string;title:string;edition:string;kind:'briefing'|'comparison'|'regional';row_count:number;projection:Projection|'combined'}
export interface WorkspaceState {
  schema:'stellar-forge.bls-labor-workspace.v1';workspace_id:string;name:string;created_at:string;
  directory:string;revision:number;source_sha256:string;editions:Edition[];reports:Report[];operations:Operation[];
  pages:Record<'editions'|'reports'|'operations',Page>;
  native_connection:{path:string;configured:boolean};
  publishers:Partial<Record<PublisherProjection,{url:string;running:boolean}>>;
}
export interface OriginalObservation extends Record<string,unknown> {
  observation_id:string;year:number;value_raw:string;value:number|null;value_status:string;
  unit:string;basis:string;source_file:string;source_sha256:string;source_url:string;raw_record:string;
}
export interface ObservationPage {
  edition_id:string;projection:Projection;rows:OriginalObservation[];total:number;offset:number;next_offset:number|null;
}
export interface Note {subject:string;revision:number;text:string;history:Array<{id:number;subject:string;revision:number;created:string;text:string;operation:string}>}
export interface UploadReceipt {id:string;name:string;path:string;bytes:number;sha256:string}
export interface BlsLaborWorkspaceClient {
  readonly workspaceId:string;readonly instanceId:string;
  state(options?:{offset?:number;limit?:number}):Promise<WorkspaceState>;
  defaultSelection():Promise<Record<string,unknown>>;
  edition(id:string):Promise<Record<string,unknown>>;
  observations(options:{edition:string;projection:Projection;filters?:Filters;offset?:number;limit?:number}):Promise<ObservationPage>;
  note(subject:string):Promise<Note>;
  report(options:{id:string;offset?:number;limit?:number}):Promise<{metadata:Record<string,unknown>;rows:Record<string,unknown>[];offset:number;total:number;next_offset:number|null}>;
  regionalDefinition(id:string):Promise<RegionalDefinition>;
  receiveRegionalDefinition(document:RegionalDefinition):Promise<{schema:string;input:RegionalAnalysisInput;source:RegionalDefinition['source'];previous_report_id:string}>;
  operation(id:string):Promise<Operation>;
  request(id:string):Promise<OperationRequest>;
  nativeState(id:string):Promise<Record<string,unknown>>;
  save(request:OperationRequest,options:{requestFile:string}):Promise<Operation>;
  resume(requestFile:string):Promise<Operation>;
  wait(operationId:string,options?:{signal?:AbortSignal;intervalMs?:number}):Promise<Operation>;
  upload(options:{file:string;id:string;name?:string;signal?:AbortSignal}):Promise<UploadReceipt>;
  uploadReceipt(id:string):Promise<UploadReceipt>;
  download(options:{kind:'source'|'report'|'export';id:string;name?:string;destination:string;signal?:AbortSignal}):Promise<{destination:string;bytes:number}>;
}
export function openBlsLaborWorkspaceClient(options:{connectionFile:string;expectedWorkspaceId?:string}):Promise<BlsLaborWorkspaceClient>;

export interface RegionalAnalysisInput {
  edition_id:string;title:string;region_name:string;narrative:string;
  counties:string[];years:number[];chart_counties?:string[];previous_report_id?:string|null;
  laus:null|{seasonal:'U'|'S';period_kinds:Array<'month'|'annual_average'>};
  qcew:null|{ownership_code:string;industry_code:string;size_code:string;quarters:number[]};
}
export interface RegionalDefinition {
  schema:'stellar-forge.bls-regional-definition.v1';method_version:string;analysis_id:string;
  source:{workspace_id:string;edition_id:string;capture_sha256:string;source_sha256:string};
  input:RegionalAnalysisInput;
}
