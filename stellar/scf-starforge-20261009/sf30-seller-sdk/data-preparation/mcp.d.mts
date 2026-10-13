import type {PipelineRequestCustomer} from './jobs/request-handoff.mjs';
import type {PreparationJobToolArguments,PreparationJobToolResults,PipelineCommissioningReadSummary} from './jobs/merchant.mjs';
import type {RecipeInput,Source,Recipe,Run,Review,Page,RequestOptions} from './client.mjs';
import type {PreparationConnection,PreparationCollection,DirectoryIdentity,PreparationStatus,RecordsPage,
 NativeDeliveryRequest,DeliveryRecord,ReceivedPreparation,PipelineDeliveryRequest,PipelineStatus,ManagedReceivedPipeline} from './connection.mjs';
import type {Definition,SavedDefinition,Execution,Page as PipelinePage,RowPage,Event,Comparison,ReceivedProject} from './pipelines/client.mjs';
export const PREPARATION_MCP_CONFIGURATION_SCHEMA:'stellar-forge.data-preparation-workspaces.v1';
export interface PreparationInput {
 label?:string;kind:'csv'|'jsonl'|'project'|'job-result';file:string;sha256:string;nullToken?:string;
}
export interface PreparationDestination {label?:string;directory:string}
export interface PreparationHostConfiguration {
 schema:typeof PREPARATION_MCP_CONFIGURATION_SCHEMA;maxFileBytes?:number;maxExpandedBytes?:number;python?:string;
 workspaces:Record<string,{
  label?:string;directory:string;workspaceSha256?:string;inputs?:Record<string,PreparationInput>;
  destinations?:Record<string,PreparationDestination>;jobCustomers?:Record<string,{label?:string;customer:PipelineRequestCustomer}>;
 }>;
}
export interface ConfiguredPreparationWorkspace {
 label:string;directory:string;directoryIdentity:DirectoryIdentity;workspaceSha256:string;connectionFile:string;
 info:{schema:'stellar-forge.data-preparation.v1';label:string;createdAt:string};
 inputs:Record<string,PreparationInput&{label:string;bytes:number}>;
 destinations:Record<string,PreparationDestination&{label:string}>;
 jobCustomers:Record<string,{label:string;customer:PipelineRequestCustomer}>;
}
export interface ReadPreparationConfiguration {
 configuration:string;sha256:string;maxFileBytes:number;maxExpandedBytes:number;python?:string;
 workspaces:Record<string,ConfiguredPreparationWorkspace>;
}
export interface PreparationMerchantConfiguration {preparationWorkspaces?:ReadPreparationConfiguration;exportsDirectory:string}
export function readPreparationWorkspaceConfiguration(path:string):Promise<ReadPreparationConfiguration>;
export interface PreparationFilePage {
 files:DeliveryRecord[];inventorySha256:string;offset:number;limit:number;total:number;nextOffset:number|null;
}
export interface PreparationFileChunk {
 readId:string;file:{name:string;contentType:string;bytes:number;sha256:string};
 offset:number;bytesRead:number;nextOffset:number|null;encoding:'base64';data:string;
}
export interface PreparationSummary {
 configured:boolean;connected:string[];pending:number;closing:boolean;
 activeFileReads:number;pendingFileCloses:number;snapshotBytes:number;immutableFileBytes:number;
 commissioning:PipelineCommissioningReadSummary|null;
}
export interface PreparationConfiguredSummary extends PreparationSummary {
 workspaces:Array<{
  workspace:string;label:string;workspaceSha256:string;state:'CONNECTED'|'DISCONNECTED';
  inputs:Array<{sourceInput:string;label:string;kind:PreparationInput['kind'];bytes:number;sha256:string}>;
  destinations:Array<{destination:string;directory:string;label:string}>;
  jobCustomers:Array<{customer:string;label:string}>;
 }>;
}
export type PreparationWorkspaceStatus=(
 {workspace:string;state:'DISCONNECTED';workspaceSha256:string}|
 (PreparationConnection&{workspace:string;state:'CONNECTED';native:PreparationStatus})
);
type Scoped={workspace:string};
type PageArguments={offset?:number;limit?:number};
export interface PreparationToolArguments extends PreparationJobToolArguments {
 merchant_preparation_pipeline_status:Scoped;
 merchant_preparation_pipeline_browser:Scoped;
 merchant_preparation_pipeline_list:Scoped&PageArguments&{collection:'pipelines'|'executions'};
 merchant_preparation_pipeline_definition:Scoped&{pipelineId:string;revision?:number};
 merchant_preparation_pipeline_save:Scoped&{definition:Definition;pipelineId?:string;expectedRevision?:number};
 merchant_preparation_pipeline_from_recipe:Scoped&{recipeId:string;revision?:number};
 merchant_preparation_pipeline_enqueue:Scoped&{pipelineId:string;requestKey:string;revision?:number;inputs?:Record<string,string>;reuseExecution?:string};
 merchant_preparation_pipeline_execute:Scoped&{executionId:string;resume?:boolean};
 merchant_preparation_pipeline_execution:Scoped&{executionId:string};
 merchant_preparation_pipeline_events:Scoped&{executionId:string;after?:number;limit?:number};
 merchant_preparation_pipeline_rows:Scoped&PageArguments&{executionId:string;stageId:string};
 merchant_preparation_pipeline_cancel:Scoped&{executionId:string};
 merchant_preparation_pipeline_recover:Scoped;
 merchant_preparation_pipeline_review:Scoped&{executionId:string;stageId:string;decision:'accept'|'revise'|'withdraw';reviewer:string;note:string;expectedRevision?:number};
 merchant_preparation_pipeline_compare:Scoped&{beforeId:string;afterId:string};
 merchant_preparation_pipeline_export:Scoped&PipelineDeliveryRequest;
 merchant_preparation_pipeline_receive:Scoped&{requestKey:string;expectedSourceSha256:string}&(
  {sourceInput:string;fileId?:never}|{fileId:string;sourceInput?:never}
 );
 merchant_preparation_pipeline_received:Scoped;
 merchant_preparation_pipeline_open_received:Scoped&{receivedId:string};
 merchant_preparation_status:{workspace?:string};
 merchant_preparation_connect:Scoped&{expectedInstanceId?:string};
 merchant_preparation_disconnect:Scoped&{instanceId:string};
 merchant_preparation_browser:Scoped;
 merchant_preparation_records:Scoped&PageArguments&{collection:PreparationCollection;expectedStateSha256?:string};
 merchant_preparation_source_page:Scoped&PageArguments&{sourceId:string};
 merchant_preparation_result_page:Scoped&PageArguments&{runId:string};
 merchant_preparation_import_source:Scoped&{sourceInput:string;expectedSourceSha256:string;alias:string};
 merchant_preparation_save_recipe:Scoped&RecipeInput;
 merchant_preparation_run:Scoped&{recipeId:string;revision?:number};
 merchant_preparation_start:Scoped&{runId:string};
 merchant_preparation_rerun:Scoped&{runId:string};
 merchant_preparation_cancel:Scoped&{runId:string};
 merchant_preparation_recover:Scoped;
 merchant_preparation_review:Scoped&{runId:string;decision:'accept'|'revise'|'withdraw';reviewer:string;note:string;expectedRevision?:number};
 merchant_preparation_export:Scoped&NativeDeliveryRequest;
 merchant_preparation_exports:Scoped&PageArguments&{expectedInventorySha256?:string};
 merchant_preparation_file:Scoped&{fileId:string;readId?:string;expectedSha256?:string;offset?:number;limit?:number};
 merchant_preparation_file_release:Scoped&{readId:string};
 merchant_preparation_receive:Scoped&{expectedSourceSha256:string;destination:string}&(
  {sourceInput:string;fileId?:never}|{fileId:string;sourceInput?:never}
 );
 merchant_preparation_received:Scoped&{destination:string};
}
export interface PreparationToolResults extends PreparationJobToolResults {
 merchant_preparation_pipeline_status:PipelineStatus;
 merchant_preparation_pipeline_browser:PreparationConnection&{url:string};
 merchant_preparation_pipeline_list:PipelinePage<SavedDefinition|Execution>;
 merchant_preparation_pipeline_definition:SavedDefinition;
 merchant_preparation_pipeline_save:SavedDefinition;
 merchant_preparation_pipeline_from_recipe:Definition;
 merchant_preparation_pipeline_enqueue:Execution;
 merchant_preparation_pipeline_execute:Execution;
 merchant_preparation_pipeline_execution:Execution;
 merchant_preparation_pipeline_events:{items:Event[];nextAfter:number|null};
 merchant_preparation_pipeline_rows:RowPage;
 merchant_preparation_pipeline_cancel:{id:string;requested:boolean};
 merchant_preparation_pipeline_recover:{executions:string[];native:{recovered:string[]}};
 merchant_preparation_pipeline_review:Review;
 merchant_preparation_pipeline_compare:Comparison;
 merchant_preparation_pipeline_export:DeliveryRecord;
 merchant_preparation_pipeline_receive:ManagedReceivedPipeline;
 merchant_preparation_pipeline_received:{items:ReceivedProject[]};
 merchant_preparation_pipeline_open_received:ManagedReceivedPipeline;
 merchant_preparation_status:PreparationConfiguredSummary|PreparationWorkspaceStatus;
 merchant_preparation_connect:PreparationConnection&{workspace:string;state:'CONNECTED';native:PreparationStatus};
 merchant_preparation_disconnect:{workspace:string;state:'DISCONNECTED';instanceId:string};
 merchant_preparation_browser:PreparationConnection&{url:string};
 merchant_preparation_records:RecordsPage;
 merchant_preparation_source_page:Page;
 merchant_preparation_result_page:Page;
 merchant_preparation_import_source:Source;
 merchant_preparation_save_recipe:Recipe;
 merchant_preparation_run:Run;
 merchant_preparation_start:Run;
 merchant_preparation_rerun:Run;
 merchant_preparation_cancel:{id:string;requested:boolean};
 merchant_preparation_recover:{recovered:string[]};
 merchant_preparation_review:Review;
 merchant_preparation_export:DeliveryRecord;
 merchant_preparation_exports:PreparationFilePage;
 merchant_preparation_file:PreparationFileChunk;
 merchant_preparation_file_release:{workspace:string;readId:string;released:true};
 merchant_preparation_receive:ReceivedPreparation;
 merchant_preparation_received:ReceivedPreparation;
}
export type PreparationToolName=keyof PreparationToolArguments;
export type PreparationToolFactory<T>=(name:PreparationToolName,description:string,properties:Record<string,unknown>,
 required:string[],annotations:{readOnly?:boolean;idempotent?:boolean;openWorld?:boolean})=>T;
export function preparationWorkspaceTools<T>(tool:PreparationToolFactory<T>):T[];
export class MerchantPreparationWorkspaces {
 constructor(config:PreparationMerchantConfiguration);
 readonly summary:PreparationSummary;
 call<T extends PreparationToolName>(name:T,args:PreparationToolArguments[T]):Promise<PreparationToolResults[T]>;
 close():Promise<void>;
}
