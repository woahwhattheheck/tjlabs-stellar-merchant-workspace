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
export type DeliveryRequest={operationId:string;expectedStateSha256:string}&(
 {kind:'project'}|{kind:'merchant';runId:string;label?:string}|{kind:'report';runId:string}|{kind:'result';runId:string;file?:ResultFile}
);
export interface DeliveryRecord {
 schema:'stellar-forge.data-preparation-delivery.v1';fileId:string;operationId:string;kind:DeliveryRequest['kind'];
 workspaceSha256:string;stateSha256:string;request:DeliveryRequest;createdAt:string;
 filename:string;mediaType:string;bytes:number;sha256:string;reused?:boolean;
}
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
 importFile(file:string,options:{alias:string;format?:'csv'|'jsonl';label?:string;nullToken?:string;expectedSha256?:string;signal?:AbortSignal}):Promise<Source>;
 exportDelivery(request:DeliveryRequest,options?:RequestOptions):Promise<DeliveryRecord>;
 downloadDelivery(record:DeliveryRecord,destination:string,options?:RequestOptions):Promise<DeliveryRecord&{path:string}>;
 close():Promise<void>;
}
