// MIT. Remote subscriber transport and original native receiving API.
import type {
 ArtifactRecord,OperatorStatus,PublisherInspection,PublicEdition,Page,RowPage,SubscriptionRow,SubscriptionChange,
 CustomerInspection,CustomerReceipt,RestoredCustomer,CustomerExport,subscriptionCustomerBackup,subscriptionAnalysisMapping
} from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/odata/live/subscriptions/index.mjs';
export type {ArtifactRecord,CustomerInspection,PublicEdition,SubscriptionRow,SubscriptionChange};
export const ODATA_SUBSCRIPTION_DOWNLOAD_SCHEMA:'stellar-forge.odata-subscription-download.v1';
export const ODATA_SUBSCRIPTION_RECEIVING_SCHEMA:'stellar-forge.odata-subscription-receiving.v1';
export interface OriginalMerchantClient {
 endpoint:string;
 call(name:string,args:Record<string,unknown>,options?:{requestSignal?:AbortSignal|null;timeoutMs?:number}):Promise<Record<string,unknown>>;
}
export interface MerchantConnection {
 url?:string;client?:OriginalMerchantClient;tokenEnv?:string;
 environment?:Record<string,string|undefined>;signal?:AbortSignal;
}
export interface PageSelection {offset?:number;limit?:number}
export interface PublisherSelection {publisher:string}
export interface ArtifactSelection {artifact:string;expectedSha256?:string}
export interface DeliverySelection extends PublisherSelection {
 artifact:string;fromRevision:number;toRevision:number;expectedEditionSha256:string;expectedFromEditionSha256?:string|null;
}
export interface SelectedArtifact {
 schema:typeof ODATA_SUBSCRIPTION_DOWNLOAD_SCHEMA;state:'INSPECTED'|'SELECTED';endpoint:string;
 artifact:ArtifactRecord;artifactSha256:string;recordSha256:string;
}
export interface DownloadProgress {exportId:string;file:string;bytes:number;total:number;state:'DOWNLOADING'}
export interface TransferOptions {
 chunkSize?:number;onProgress?:(event:DownloadProgress)=>void|Promise<void>;
}
export interface DownloadResult {
 schema:typeof ODATA_SUBSCRIPTION_DOWNLOAD_SCHEMA;state:'COMPLETE';directory:string;endpoint:string;
 exportId:string;manifestSha256:string;artifact:string;kind:ArtifactRecord['kind'];artifactSha256:string;
 nativeManifest:string;artifactRecord:string;resumed:boolean;resumedBytes:number;files:number;bytes:number;
}
export interface VerifiedDownload {
 schema:typeof ODATA_SUBSCRIPTION_DOWNLOAD_SCHEMA;state:'COMPLETE';directory:string;endpoint:string;
 artifact:ArtifactRecord;artifactSha256:string;recordSha256:string;nativeManifest:string;artifactRecord:string;
}
export interface ReceivingResult {
 schema:typeof ODATA_SUBSCRIPTION_RECEIVING_SCHEMA;state:'COMPLETE';endpoint:string;artifact:string;
 kind:'transfer'|'customer-backup'|'analysis';artifactSha256:string;downloadDirectory:string;customerDirectory:string;
 result:CustomerReceipt|RestoredCustomer|(RestoredCustomer&{schema:string;rows:number});
}
export interface OfflineDownloadSelection {directory:string;expectedSha256?:string;signal?:AbortSignal}
export interface CustomerSelection {directory:string}
export interface SelectedCustomerExport extends CustomerSelection {output:string;expectedRevision:number;expectedEditionSha256:string}
export function inspectMerchantODataSubscriptions(input:MerchantConnection):Promise<OperatorStatus&{endpoint:string}>;
export function inspectMerchantODataSubscriptionPublisher(input:MerchantConnection&PublisherSelection):Promise<PublisherInspection&PublisherSelection&{endpoint:string}>;
export function listMerchantODataSubscriptionEditions(input:MerchantConnection&PublisherSelection&PageSelection):Promise<Page<PublicEdition>&PublisherSelection&{definitionSha256:string;endpoint:string}>;
export function readMerchantODataSubscriptionRows(input:MerchantConnection&PublisherSelection&PageSelection&{
 revision:number;kind?:'rows'|'changes';expectedEditionSha256?:string;
}):Promise<RowPage<SubscriptionRow|SubscriptionChange>&PublisherSelection&{kind:'rows'|'changes';endpoint:string}>;
export function listMerchantODataSubscriptionArtifacts(input:MerchantConnection&PageSelection):Promise<Page<ArtifactRecord|Record<string,unknown>>&{endpoint:string}>;
export function inspectMerchantODataSubscriptionArtifact(input:MerchantConnection&ArtifactSelection):Promise<SelectedArtifact&{state:'INSPECTED'}>;
export function createMerchantODataSubscriptionDelivery(input:MerchantConnection&DeliverySelection):Promise<SelectedArtifact&{state:'SELECTED'}>;
export function downloadMerchantODataSubscriptionArtifact(input:MerchantConnection&TransferOptions&{
 artifact:string;expectedSha256:string;directory:string;
}):Promise<DownloadResult>;
export function inspectODataSubscriptionDownload(input:OfflineDownloadSelection):Promise<VerifiedDownload>;
export function receiveODataSubscriptionDownload(input:OfflineDownloadSelection&{
 expectedSha256:string;customerDirectory:string;
}):Promise<ReceivingResult>;
export function fetchODataSubscription(input:MerchantConnection&DeliverySelection&TransferOptions&{
 directory:string;customerDirectory:string;
}):Promise<{
 schema:typeof ODATA_SUBSCRIPTION_RECEIVING_SCHEMA;state:'COMPLETE';
 selection:SelectedArtifact&{state:'SELECTED'};download:DownloadResult;receiving:ReceivingResult;
}>;
export function inspectReceivedODataSubscription(input:CustomerSelection):Promise<CustomerInspection>;
export function readReceivedODataSubscriptionRows(input:CustomerSelection&PageSelection):Promise<RowPage<SubscriptionRow>>;
export function backupReceivedODataSubscription(input:SelectedCustomerExport):ReturnType<typeof subscriptionCustomerBackup>;
export function exportReceivedODataSubscription(input:SelectedCustomerExport&{title?:string}):Promise<CustomerExport>;
export function restoreODataSubscriptionCustomer(input:{
 sourceDirectory:string;customerDirectory:string;kind:'customer-backup'|'analysis';expectedSha256:string;signal?:AbortSignal;
}):Promise<RestoredCustomer|(RestoredCustomer&{schema:string;rows:number})>;
export function receivedODataSubscriptionAnalysisMapping(input:CustomerSelection&{
 source:string;sourceRevision:number;
}):Promise<ReturnType<typeof subscriptionAnalysisMapping>>;
