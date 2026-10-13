import type {PipelineRequestCustomer,PipelineRequestCatalog,PipelineRequestHandoff} from './request-handoff.mjs';
import type {PreparedPipelineJob,ReceivedPipelineJob} from './customer.mjs';
import type {JobPackageIdentity,JobPackageJob} from '../../jobs/outputs/index.mjs';
export type PipelineOrderFileName='project.zip'|'selection.json'|'input.json'|'review.html';
export type PipelineResultFileSelection='package'|'report'|'project'|'execution'|'results';
export type OriginalPipelineJob=Pick<JobPackageJob,'id'|'inputSha256'|'publicOrigin'|'nativeSettlement'>&
 {functionId:'executePipeline'}&Partial<Pick<JobPackageJob,'configSha256'|'applicationSha256'|'attemptId'>>;
export interface PipelinePackageExpected {
 expectedBytes:number;expectedSourceSha256:string;expectedFilename:string;
}
type Scoped={workspace:string};
type SourceSelection={sourceInput:string;fileId?:never}|{fileId:string;sourceInput?:never};
type ResultSource={sourceInput:string;downloadDestination?:never}|{downloadDestination:string;sourceInput?:never};
type OptionalExpected=PipelinePackageExpected|{
 expectedBytes?:never;expectedSourceSha256?:never;expectedFilename?:never;
};
export interface PreparationJobToolArguments {
 merchant_preparation_job_catalog:Scoped&{customer:string;merchantOrigin:string};
 merchant_preparation_job_request:Scoped&{customer:string;orderDestination:string;expectedOrderSha256:string;merchantOrigin:string;
  expectedCatalogSha256:string;reference:string;label:string};
 merchant_preparation_job_prepare:Scoped&SourceSelection&{expectedSourceSha256:string;orderDestination:string;
  pipelineId:string;revision:number;reportName:string;inputs?:Record<string,string>;reuseExecution?:string};
 merchant_preparation_job_order:Scoped&{orderDestination:string;expectedOrderSha256?:string};
 merchant_preparation_job_receive:Scoped&ResultSource&PipelinePackageExpected&{
  packageDestination:string;destination:string;job:OriginalPipelineJob};
 merchant_preparation_job_reopen:Scoped&OptionalExpected&{
  packageDestination:string;destination:string;job?:OriginalPipelineJob};
 merchant_preparation_job_result_files:Scoped&{packageDestination:string;job?:OriginalPipelineJob};
 merchant_preparation_job_file:Scoped&{expectedSha256:string;readId?:string;offset?:number;limit?:number}&(
  {kind:'order';orderDestination:string;selection:PipelineOrderFileName;packageDestination?:never;job?:never}|
  {kind:'result';packageDestination:string;selection:PipelineResultFileSelection;orderDestination?:never;job?:OriginalPipelineJob}
 );
 merchant_preparation_job_file_release:Scoped&{readId:string};
}
export interface PreparedPipelineOrder {
 workspace:string;orderDestination:string;directory:string;prepared:PreparedPipelineJob;
}
export interface PipelineCommissioningFile {
 selection:string;name:string;contentType:string;bytes:number;sha256:string;
}
export interface PipelineCommissioningChunk {
 readId:string;file:{name:string;contentType:string;bytes:number;sha256:string};
 offset:number;bytesRead:number;nextOffset:number|null;encoding:'base64';data:string;
}
export interface PipelineCommissioningReadSummary {
 activeFileReads:number;pendingFileCloses:number;snapshotBytes:number;immutableFileBytes:number;
}
export interface PreparationJobToolResults {
 merchant_preparation_job_catalog:PipelineRequestCatalog;
 merchant_preparation_job_request:PipelineRequestHandoff;
 merchant_preparation_job_prepare:PreparedPipelineOrder;
 merchant_preparation_job_order:PreparedPipelineOrder&{orderSha256:string;files:PipelineCommissioningFile[]};
 merchant_preparation_job_receive:ReceivedPipelineJob&{workspaceAlias:string;packageDestination:string;destination:string};
 merchant_preparation_job_reopen:ReceivedPipelineJob&{workspaceAlias:string;packageDestination:string;destination:string};
 merchant_preparation_job_result_files:{workspace:string;packageDestination:string;package:JobPackageIdentity;
  job:JobPackageJob;manifestSha256:string;files:PipelineCommissioningFile[]};
 merchant_preparation_job_file:PipelineCommissioningChunk;
 merchant_preparation_job_file_release:{workspace:string;readId:string;released:true};
}
export interface PreparationCommissioningContext {
 scope:{alias:string;directory:string;workspaceSha256:string;directoryIdentity:{dev:string;ino:string}};
 python?:string;
 customer(alias:string):{label:string;customer:PipelineRequestCustomer};
 input(args:Record<string,unknown>,kind:'project'|'job-result'):{file:string;bytes:number;sha256:string};
 destination(alias:string):{directory:string};
 exported(fileId:string):Promise<{path:string;record:{kind:string;bytes:number;sha256:string}}>;
}
export class PreparationCommissioning {
 readonly summary:PipelineCommissioningReadSummary;
 call<T extends keyof PreparationJobToolArguments>(name:T,args:PreparationJobToolArguments[T],context:PreparationCommissioningContext):Promise<PreparationJobToolResults[T]>;
 disconnect(scope:{alias:string}):Promise<void>;
 close():Promise<void>;
}
