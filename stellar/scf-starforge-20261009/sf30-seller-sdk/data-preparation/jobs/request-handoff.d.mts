export interface PipelineRequestCustomer {
 directory:string;runtimeDirectory:string;operatorWorkspace?:string;operatorProfile?:string;expectedInstanceId?:string;
}
export interface PipelineRequestCatalog {
 schema:'stellar-forge.job-intake-catalog.v1';publicOrigin:string;catalogSha256:string;
 serviceName:string;authentication:'none'|'access-token';functions:Array<Record<string,unknown>&{id:string}>;
 [key:string]:unknown;
}
export interface PipelineRequestHandoff {
 schema:'stellar-forge.preparation-pipeline-request-handoff.v1';orderSha256:string;
 requestId:string;reference:string;requestRevision:number;catalogSha256:string;functionSha256:string;
 customer:{directory:string;runtimeDirectory:string;instanceId:string};
 requestUrl:string;request:Record<string,unknown>;
 files:Array<{slot:'project'|'selection';uploadId:string;file:Record<string,unknown>;state:string}>;reused:boolean;
}
export function discoverPipelineRequest(options:{
 customer:PipelineRequestCustomer;merchantOrigin:string;signal?:AbortSignal;
}):Promise<PipelineRequestCatalog>;
export function seedPreparedPipelineRequest(options:{
 orderDirectory:string;expectedOrderSha256:string;customer:PipelineRequestCustomer;merchantOrigin:string;
 expectedCatalogSha256:string;reference:string;label:string;signal?:AbortSignal;
}):Promise<PipelineRequestHandoff>;
