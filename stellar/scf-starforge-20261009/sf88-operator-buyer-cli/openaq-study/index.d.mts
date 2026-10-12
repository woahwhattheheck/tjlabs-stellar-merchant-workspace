/// <reference types="node" />
/** Original OpenAQ source and original SF88 Buyer authorities are preserved. */
export type JsonScalar = string | number | boolean | null;
export type Json = JsonScalar | Json[] | {[key:string]:Json};
export type NativeRecord = Record<string,unknown>;
export interface FileIdentity {bytes:number;sha256:string}
export interface DeliveryFile extends FileIdentity {name:string}
export interface SourceFile extends FileIdentity {path:string}
export interface OriginalRelease {
 id:string;label:string;digest:string;publicOrigin:string;
 mode:'NATIVE_X402'|'CHALLENGE_ONLY';facilitator:string|null;
}
export interface SourceCapture {id:string;sha256:string;rows:number}
export interface SourceReview {id:string;sha256:string;decision:'accepted';allowDerivedDelivery:true}
export interface ScientificArchive extends FileIdentity {
 file:'study.tgz';manifestSha256:string;sourceWorkspaceId:string;reports:string[];files:SourceFile[];
}
export interface OpenAQHandoff {
 schema:typeof HANDOFF_SCHEMA;sha256:string;workspaceId:string;projectConfigurationSha256:string;stageRequestId:string;
 preparationRequestId:string;exportRequestId:string;release:OriginalRelease;resource:string;
 offer:NativeRecord;dataset:NativeRecord & {baselineSnapshot:string;contractSha256:string;rowCount:number;description:NativeRecord};
 capture:SourceCapture;sourceReview:SourceReview;study:ScientificArchive;provenance:NativeRecord;
}
export interface HostOptions {environment?:NodeJS.ProcessEnv;signal?:AbortSignal}
export interface ArchiveOptions extends HostOptions {python?:string;maxBytes?:number}
export interface DatasetLimits {maxPages:number;maxTotalAtomic:string;maxRows:number;maxPageBytes:number}
export interface DatasetPage extends NativeRecord {index:number;intentId:string;sha256?:string;bytes?:number}
export interface NativeDatasetSession extends NativeRecord {
 schema:'stellar-forge.sf88.dataset-acquisition.v1';directory:string;configurationSha256:string;
 sessionId:string;expectedSnapshot:string|null;status:string;limits:DatasetLimits;capAllocatedAtomic:string;
 completedPages:number;acquiredRows:number;totalRows:number|null;snapshot:string|null;pages:DatasetPage[];
}
export interface PreparedBuyer {
 schema:typeof CUSTOMER_SCHEMA;directory:string;requestSha256:string;handoffSha256:string;
 configurationSha256:string;sessionDirectory:string;operatorDirectory:string;status:string;native:NativeDatasetSession;
}
export interface BuyerInspection extends NativeRecord {
 schema:typeof CUSTOMER_SCHEMA;directory:string;requestSha256:string;handoffSha256:string;
 release:OriginalRelease;capture:SourceCapture;sourceReview:SourceReview;query:string;terms:NativeRecord;limits:DatasetLimits;
 sessionDirectory:string;operatorDirectory:string;native:NativeDatasetSession;
}
export interface Accounting {
 schema:'stellar-forge.openaq-buyer.v1.accounting';requestSha256:string;sessionId:string;
 configurationSha256:string;mode:'VIEW'|'FINALIZE';pages:NativeRecord[];entries:NativeRecord[];
 interrupted:boolean;recordAuthority:'ORIGINAL_SF36_LEDGER_AND_ORIGINAL_DATASET_ACCOUNTING';
}
export interface DatasetDeliveryReport extends NativeRecord {
 schema:'stellar-forge.sf88.dataset-delivery.v1';directory:string;
 nativeStatus:NativeRecord & {finalized:true;snapshot:string;rows:number};
 outputs:Record<string,FileIdentity & {path:string}>;
}
export type DatasetOutputName='dataset.jsonl'|'dataset.csv'|'review.html'|'manifest.json'|'semantics.json';
export interface VerifiedDatasetFile {
 metadata:FileIdentity & {name:DatasetOutputName;path:string};directory:string;
 chunks(options?:{signal?:AbortSignal}):AsyncIterable<Uint8Array>;
 bytes(options?:{limit?:number;signal?:AbortSignal}):Promise<Uint8Array>;
 json(options?:{limit?:number;signal?:AbortSignal}):Promise<unknown>;
}
export interface OpenAQTypedDataset {
 readonly report:DatasetDeliveryReport;readonly manifest:NativeRecord;
 file(name:DatasetOutputName):VerifiedDatasetFile;
 rows(options?:{signal?:AbortSignal;maxRowCharacters?:number}):AsyncIterable<Record<string,JsonScalar>>;
 readRows(options?:{limit?:number;maxRows?:number;signal?:AbortSignal}):Promise<Array<Record<string,JsonScalar>>>;
 readSemantics(options?:{limit?:number;signal?:AbortSignal}):Promise<unknown|null>;
}
export interface DeliveryManifest {
 schema:typeof DELIVERY_SCHEMA;id:string;sha256:string;requestSha256:string;handoffSha256:string;
 nativeSession:NativeRecord & {status:'COMPLETE';sessionId:string;configurationSha256:string};
 scientificStudy:{capture:SourceCapture;sourceReview:SourceReview;archive:ScientificArchive};
 dataset:{snapshot:string;rows:number;outputs:DatasetDeliveryReport['outputs']};files:DeliveryFile[];
}
export interface ExportedDelivery {
 schema:typeof DELIVERY_SCHEMA;state:'EXPORTED';directory:string;manifestSha256:string;manifest:DeliveryManifest;reopened?:boolean;
}
export interface ReceivedDelivery {
 schema:typeof DELIVERY_SCHEMA;state:'RECEIVED';directory:string;receivingId:string;manifestSha256:string;
 requestSha256:string;files:DeliveryFile[];session:NativeRecord;study:NativeRecord;
 dataset:DatasetDeliveryReport;accounting:Accounting;originalDatasetReport:string;manifestFile:string;
}
export const HANDOFF_SCHEMA:'stellar-forge.openaq-buyer-handoff.v1';
export const CUSTOMER_SCHEMA:'stellar-forge.openaq-buyer.v1';
export const DELIVERY_SCHEMA:'stellar-forge.openaq-buyer-delivery.v1';
export function validateOpenAQHandoff(value:unknown):OpenAQHandoff;
export function readOpenAQHandoff(options:{directory:string;sha256:string}):Promise<{
 directory:string;sha256:string;bytes:number;handoff:OpenAQHandoff;raw:Uint8Array;
}>;
export function prepareOpenAQBuyerHandoff(options:HostOptions & {
 projectDirectory:string;stageRequestId:string;exportRequestId:string;expectedReleaseDigest:string;directory:string;connectionFile?:string;
}):Promise<{schema:typeof HANDOFF_SCHEMA;directory:string;handoffSha256:string;handoffBytes:number;handoff:OpenAQHandoff;files:DeliveryFile[]}>;
export function prepareOpenAQDatasetRequest(handoff:OpenAQHandoff,options:{
 intentId:string;acceptIndex:number;query?:string;
}):{draft:NativeRecord;data:Uint8Array;configSha256:string};
export interface BuyerPreparationOptions {
 directory:string;handoffDirectory:string;handoffSha256:string;operatorDirectory:string;
 intentId:string;acceptIndex:number;query?:string;maxPages:number;maxTotalAtomic:string;
 maxRows?:number;maxPageBytes?:number;resumePreparation?:boolean;signal?:AbortSignal;
}
export function prepareOpenAQBuyer(options:BuyerPreparationOptions):Promise<PreparedBuyer>;
export function inspectOpenAQBuyer(options:{directory:string}):Promise<BuyerInspection>;
export function runOpenAQBuyer(options:HostOptions & {
 directory:string;retryUnpaid?:boolean;retryExpired?:NativeRecord;expectedAttemptSha256?:string;
}):Promise<NativeDatasetSession>;
export function recoverOpenAQBuyer(options:{directory:string}):Promise<NativeDatasetSession>;
export function accountOpenAQBuyer(options:{directory:string;finalize?:boolean;signal?:AbortSignal}):Promise<Accounting>;
export function deliverOpenAQBuyer(options:{directory:string;destination:string}):Promise<DatasetDeliveryReport>;
export function exportOpenAQBuyerDelivery(options:ArchiveOptions & {
 directory:string;destination:string;exportId:string;
}):Promise<ExportedDelivery>;
export function inspectOpenAQBuyerDelivery(options:{directory:string;manifestSha256?:string;signal?:AbortSignal}):Promise<{
 schema:typeof DELIVERY_SCHEMA;directory:string;manifestSha256:string;manifest:DeliveryManifest;
 native:NativeDatasetSession;dataset:DatasetDeliveryReport;accounting:Accounting;
 scientificStudy:DeliveryManifest['scientificStudy'];
}>;
export function receiveOpenAQBuyerDelivery(options:ArchiveOptions & {
 sourceDirectory:string;manifestSha256:string;directory:string;receivingId:string;
}):Promise<ReceivedDelivery>;
export function reopenOpenAQBuyerDelivery(options:HostOptions & {directory:string;python?:string}):Promise<ReceivedDelivery>;
export function openOpenAQBuyerDataset(options:{directory:string;manifestSha256?:string;signal?:AbortSignal}):Promise<OpenAQTypedDataset>;
