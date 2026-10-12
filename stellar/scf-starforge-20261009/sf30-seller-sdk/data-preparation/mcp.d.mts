import type {RecipeInput,Source,Recipe,Run,Review,Page,RequestOptions} from './client.mjs';
import type {PreparationConnection,PreparationCollection,DirectoryIdentity,PreparationStatus,RecordsPage,
 DeliveryRequest,DeliveryRecord,ReceivedPreparation} from './connection.mjs';
export const PREPARATION_MCP_CONFIGURATION_SCHEMA:'stellar-forge.data-preparation-workspaces.v1';
export interface PreparationInput {
 label?:string;kind:'csv'|'jsonl'|'project';file:string;sha256:string;nullToken?:string;
}
export interface PreparationDestination {label?:string;directory:string}
export interface PreparationHostConfiguration {
 schema:typeof PREPARATION_MCP_CONFIGURATION_SCHEMA;maxFileBytes?:number;maxExpandedBytes?:number;
 workspaces:Record<string,{
  label?:string;directory:string;workspaceSha256?:string;inputs?:Record<string,PreparationInput>;
  destinations?:Record<string,PreparationDestination>;
 }>;
}
export interface ConfiguredPreparationWorkspace {
 label:string;directory:string;directoryIdentity:DirectoryIdentity;workspaceSha256:string;connectionFile:string;
 info:{schema:'stellar-forge.data-preparation.v1';label:string;createdAt:string};
 inputs:Record<string,PreparationInput&{label:string;bytes:number}>;
 destinations:Record<string,PreparationDestination&{label:string}>;
}
export interface ReadPreparationConfiguration {
 configuration:string;sha256:string;maxFileBytes:number;maxExpandedBytes:number;
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
}
export interface PreparationConfiguredSummary extends PreparationSummary {
 workspaces:Array<{
  workspace:string;label:string;workspaceSha256:string;state:'CONNECTED'|'DISCONNECTED';
  inputs:Array<{sourceInput:string;label:string;kind:PreparationInput['kind'];bytes:number;sha256:string}>;
  destinations:Array<{destination:string;directory:string;label:string}>;
 }>;
}
export type PreparationWorkspaceStatus=(
 {workspace:string;state:'DISCONNECTED';workspaceSha256:string}|
 (PreparationConnection&{workspace:string;state:'CONNECTED';native:PreparationStatus})
);
type Scoped={workspace:string};
type PageArguments={offset?:number;limit?:number};
export interface PreparationToolArguments {
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
 merchant_preparation_export:Scoped&DeliveryRequest;
 merchant_preparation_exports:Scoped&PageArguments&{expectedInventorySha256?:string};
 merchant_preparation_file:Scoped&{fileId:string;readId?:string;expectedSha256?:string;offset?:number;limit?:number};
 merchant_preparation_file_release:Scoped&{readId:string};
 merchant_preparation_receive:Scoped&{expectedSourceSha256:string;destination:string}&(
  {sourceInput:string;fileId?:never}|{fileId:string;sourceInput?:never}
 );
 merchant_preparation_received:Scoped&{destination:string};
}
export interface PreparationToolResults {
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
