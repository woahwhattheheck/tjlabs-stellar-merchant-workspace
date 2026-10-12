import {PreparationClient} from './client.mjs';
import type {RequestOptions,Source,Recipe,Run,Review,Page} from './client.mjs';
export type {RequestOptions,Source,Recipe,Run,Review,Page,State,RecipeInput,ReviewInput,Cell} from './client.mjs';
export type PreparationCollection='sources'|'recipes'|'runs'|'reviews';
export interface CollectionRecords {sources:Source;recipes:Recipe;runs:Run;reviews:Review}
export interface DirectoryIdentity {dev:string;ino:string}
export interface PreparationConnection {
 schema:'stellar-forge.data-preparation-listener.v1';directory:string;directoryIdentity:DirectoryIdentity;
 workspaceSha256:string;instanceId:string;pid:number;startedAt:string;origin:string;
 connectionFile:string;connectionSha256:string;
}
export interface PrivatePreparationConnection extends Omit<PreparationConnection,'connectionFile'|'connectionSha256'> {token:string;url:string}
export interface ConnectionFile {path:string;sha256:string;value:PrivatePreparationConnection}
export interface ConnectionOptions {directory?:string;workspaceSha256?:string;expectedInstanceId?:string}
export interface PreparationStatus {
 schema:'stellar-forge.data-preparation.v1';label:string;createdAt:string;workspaceSha256:string;stateSha256:string;
 counts:Record<PreparationCollection,number>;running:number;
}
export interface RecordsPage<C extends PreparationCollection=PreparationCollection> {
 collection:C;records:Array<CollectionRecords[C]>;stateSha256:string;offset:number;limit:number;total:number;nextOffset:number|null;
}
export interface RecordsOptions extends RequestOptions {offset?:number;limit?:number;expectedStateSha256?:string}
export type ResultFile='result.csv'|'result.jsonl'|'schema.json';
export type NativeDeliveryRequest={operationId:string;expectedStateSha256:string}&(
 {kind:'project'}|{kind:'merchant';runId:string;label?:string}|{kind:'report';runId:string}|{kind:'result';runId:string;file?:ResultFile}
);
export type PipelineDeliveryRequest={operationId:string;expectedStateSha256:string;expectedPipelineSha256:string}&(
 {kind:'pipeline-project'}|
 {kind:'pipeline-results'|'pipeline-report';executionId:string}|
 {kind:'pipeline-merchant';executionId:string;stageId:string;label?:string}|
 {kind:'pipeline-result';executionId:string;stageId:string;file?:ResultFile}
);
export type DeliveryRequest=NativeDeliveryRequest|PipelineDeliveryRequest;
export interface PipelineStatus {
 schema:'stellar-forge.preparation-pipelines.v1';label:string;stateSha256:string;pipelineStateSha256:string;
 pipelines:number;editions:number;executions:number;events:number;running:number;
}
export interface ManagedReceivedPipeline {
 id:string;label:string;path:string;archiveSha256:string;bytes:number;createdAt:string;
 pipelines:number;executions:number;sources:number;nativeRuns:number;
 origin:string;url:string;connectionFile:string;workspaceSha256:string;instanceId:string;
}
export interface DeliveryRecord {
 schema:'stellar-forge.data-preparation-delivery.v1';fileId:string;operationId:string;kind:DeliveryRequest['kind'];
 workspaceSha256:string;stateSha256:string;request:DeliveryRequest;createdAt:string;
 filename:string;mediaType:string;bytes:number;sha256:string;reused?:boolean;pipelineStateSha256?:string;
}
export interface PreparationDownloadLink {url:string;expiresInSeconds:300;instanceId:string}
export interface ReceivedPreparation {
 schema:'stellar-forge.data-preparation-received.v1';sourceSha256:string;receivedAt:string;originalStateSha256:string;
 directory:string;stateSha256:string;workspaceSha256:string;counts:Record<PreparationCollection,number>;
 application:'data-preparation-workspace';reused?:boolean;
}
export const PREPARATION_CONNECTION_SCHEMA:'stellar-forge.data-preparation-listener.v1';
export const PREPARATION_STARTUP_SCHEMA:'stellar-forge.data-preparation-managed-startup.v1';
export const PREPARATION_CONNECTION_FILENAME:'preparation-connection.json';
export const PREPARATION_HASH:RegExp;
export const PREPARATION_MAX_JSON_BYTES:number;
export const PREPARATION_DEFAULT_RECEIVING_BYTES:number;
export function readPreparationConnection(path:string,options?:ConnectionOptions):Promise<ConnectionFile>;
export function preparationWorkspaceIdentity(directory:string):Promise<{
 directory:string;directoryIdentity:DirectoryIdentity;workspaceSha256:string;
 info:{schema:'stellar-forge.data-preparation.v1';label:string;createdAt:string};
}>;
export class PreparationWorkspaceClient extends PreparationClient {
 private constructor();
 static connect(path:string,options?:ConnectionOptions):Promise<PreparationWorkspaceClient>;
 readonly connection:PreparationConnection;
 inspect(options?:RequestOptions):Promise<Omit<PreparationConnection,'connectionFile'|'connectionSha256'>>;
 status(options?:RequestOptions):Promise<PreparationStatus>;
 records<C extends PreparationCollection>(collection:C,options?:RecordsOptions):Promise<RecordsPage<C>>;
 browser():Promise<PreparationConnection&{url:string}>;
 pipelineBrowser():Promise<PreparationConnection&{url:string}>;
 pipelineStatus(options?:RequestOptions):Promise<PipelineStatus>;
 exportPipelineDelivery(request:PipelineDeliveryRequest,options?:RequestOptions):Promise<DeliveryRecord>;
 receivePipelineProject(file:string,options:{requestKey:string;expectedSha256?:string;signal?:AbortSignal}):Promise<ManagedReceivedPipeline>;
 downloadOriginal(relative:string,destination:string,options?:RequestOptions&{sha256?:string;bytes?:number}):Promise<{path:string;sha256:string;bytes:number}>;
 importFile(file:string,options:{alias:string;format?:'csv'|'jsonl';label?:string;nullToken?:string;expectedSha256?:string;signal?:AbortSignal}):Promise<Source>;
 exportDelivery(request:DeliveryRequest,options?:RequestOptions):Promise<DeliveryRecord>;
 downloadLink(originalUrlOrPath:string,options?:RequestOptions):Promise<PreparationDownloadLink>;
 resultDownloadLink(runId:string,file?:ResultFile,options?:RequestOptions):Promise<PreparationDownloadLink>;
 preparedDownloadLink(relative:string,options?:RequestOptions):Promise<PreparationDownloadLink>;
 deliveryDownloadLink(fileId:string,options?:RequestOptions):Promise<PreparationDownloadLink>;
 downloadDelivery(record:DeliveryRecord,destination:string,options?:RequestOptions):Promise<DeliveryRecord&{path:string}>;
 close():Promise<void>;
}
