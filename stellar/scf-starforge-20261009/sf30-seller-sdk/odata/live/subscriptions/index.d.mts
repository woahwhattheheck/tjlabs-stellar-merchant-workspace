import type {Server,IncomingMessage,ServerResponse} from 'node:http';
import type {FileHandle} from 'node:fs/promises';
export type Json = null | boolean | number | string | Json[] | {[key:string]:Json};
export type Scalar = null | boolean | number | string;
export interface FileIdentity {bytes:number;sha256:string}
export interface FileEntry extends FileIdentity {path:string}
export interface MappingField {path:string;name:string;underlyingType:string;key:boolean;nullable:boolean;[key:string]:unknown}
export interface SubscriptionDefinition {
 schema:'stellar-forge.odata-collection-subscription.v1';engine:string;title:string;serviceRoot:string;entitySet:string;
 keyFields:string[];mapping:MappingField[];initialScope:Record<string,Json>;presenceMeaning:string;publicationMeaning:string;
}
export interface ChangeCounts {before:number;after:number;matched:number;added:number;removed:number;changed:number;unchanged:number;events:number}
export interface SubscriptionRow {key:string;values:Record<string,Scalar>}
export interface SubscriptionChange {key:string;operation:'upsert'|'remove';before:string|null;after:string|null;values?:Record<string,Scalar>}
export interface SubscriptionSource {
 collectionSha256:string;analysis:FileEntry&{format:string};sourceBinding:string;serviceRoot:string;entitySet:string;metadataSha256:string;
 merchantOrigin:string;operation:string;rows:number;query:Record<string,Json>;queryFingerprint:string;
 acquisition:Record<string,Json>;pageCount:number;completion:unknown;reportedCounts:unknown;countConsistent:boolean;
}
export interface SubscriptionEdition {
 schema:'stellar-forge.odata-subscription-edition.v1';engine:string;revision:number;definitionSha256:string;previousSha256:string|null;
 requestId:string;requestSha256:string;selectedAt:string;note:string;scopeChanged:boolean;source:SubscriptionSource;
 rows:number;counts:ChangeCounts;files:{'rows.jsonl':FileIdentity;'changes.jsonl':FileIdentity};
}
export type PublicEdition=SubscriptionEdition&{manifestSha256:string};
export interface AppendReceipt {schema:'stellar-forge.odata-subscription-append.v1';requestId:string;requestSha256:string;revision:number;manifestSha256:string;rows:number;changes:ChangeCounts;source:SubscriptionSource;scopeChanged:boolean;reused:boolean}
export interface PublisherInspection {schema:'stellar-forge.odata-subscription-inspection.v1';definition:SubscriptionDefinition;definitionSha256:string;head:number;pending:string|null;current:PublicEdition|null}
export interface Page<T> {offset:number;total:number;items:T[];nextOffset:number|null}
export interface RowPage<T> extends Page<T> {revision:number;editionSha256:string;kind?:'rows'|'changes'}
export interface CreateRequest {directory:string;collectionDirectory:string;collectionSha256:string;title:string;fields?:string[];requestId:string}
export interface AppendRequest {directory:string;collectionDirectory:string;collectionSha256:string;requestId:string;expectedRevision:number;note:string;allowScopeChange?:boolean}
export interface TransferResult extends FileIdentity {schema:'stellar-forge.odata-subscription-delivery.v1';directory:string;manifest:'transfer.json';mode:'baseline'|'changes';fromRevision:number;toRevision:number;fromEditionSha256:string|null;toEditionSha256:string;files:number;bytesTotal:number}
export interface CustomerReceipt {schema:'stellar-forge.odata-subscription-customer-receipt.v1';transferSha256:string;definitionSha256:string;fromRevision:number;toRevision:number;editionSha256:string;rows:number;snapshot:FileEntry;scopeChanges:number[];reused?:boolean}
export interface CustomerInspection {
 schema:'stellar-forge.odata-subscription-customer.v1';definitionSha256:string;revision:number;editionSha256:string;rows:number;snapshot:FileEntry;
 transfers:Array<FileIdentity&{result:CustomerReceipt}>;definition:SubscriptionDefinition;pending:Record<string,unknown>|null;
}
export interface SelectedCustomerExport {output:string;expectedRevision?:number;expectedEditionSha256?:string}
export interface CustomerExport {directory:string;rows:number;revision:number;editionSha256:string;source:FileEntry;dataset:FileIdentity;originals:number;columns:string[]}
export interface RestoredCustomer {sha256:string;revision:number;editionSha256:string;reused:boolean}
export declare const STATE_SCHEMA:'stellar-forge.odata-subscription-state.v1';
export declare function editionDirectory(revision:number):string;
export declare function createSubscription(input:CreateRequest):Promise<AppendReceipt>;
export declare function appendSubscription(input:AppendRequest):Promise<AppendReceipt>;
export declare function inspectSubscription(directory:string):Promise<PublisherInspection>;
export declare function subscriptionEditions(directory:string,options?:{offset?:number;limit?:number}):Promise<Page<PublicEdition>&{definitionSha256:string}>;
export declare function subscriptionRows(directory:string,options?:{revision?:number;kind?:'rows'|'changes';offset?:number;limit?:number}):Promise<RowPage<SubscriptionRow|SubscriptionChange>>;
export declare function cancelSubscriptionRequest(directory:string,input:{requestId:string}):Promise<{requestId:string;state:'CANCELLED';cancelledAt:string;reused:boolean}>;
export declare function exportSubscription(directory:string,options:{output:string;fromRevision?:number;toRevision?:number}):Promise<TransferResult>;
export declare function exportSubscriptionOriginal(directory:string,options:{output:string;revision?:number}):Promise<{revision:number;collectionSha256:string;analysis:FileEntry&{format:string};files:number;directory:string}>;
export declare function subscriptionBackup(directory:string,options:{output:string;expectedRevision?:number}):Promise<FileIdentity&{directory:string;head:number;files:number}>;
export declare function restoreSubscription(input:{directory:string;source:string;expectedSha256:string}):Promise<{schema:string;sha256:string;definitionSha256:string;head:number;reused:boolean}>;
export declare function verifySubscriptionTransfer(directory:string,expectedSha256:string):Promise<{root:string;raw:Buffer;bytes:number;manifest:Record<string,unknown>;definition:SubscriptionDefinition;definitionRaw:Buffer;editions:Array<{edition:SubscriptionEdition;sha256:string}>}>;
export declare function receiveSubscription(input:{directory:string;transferDirectory:string;expectedSha256:string}):Promise<CustomerReceipt&{reused:boolean}>;
export declare function inspectSubscriptionCustomer(directory:string):Promise<CustomerInspection>;
export declare function subscriptionCustomerRows(directory:string,options?:{offset?:number;limit?:number}):Promise<RowPage<SubscriptionRow>>;
export declare function subscriptionCustomerBackup(directory:string,options:SelectedCustomerExport):Promise<FileIdentity&{directory:string;revision:number;files:number}>;
export declare function restoreSubscriptionCustomer(input:{directory:string;source:string;expectedSha256:string}):Promise<RestoredCustomer>;
export declare function subscriptionAnalysisMapping(definition:SubscriptionDefinition,options:{source:string;sourceRevision:number}):{source:string;source_revision:number;mapping:{collection:'';sse_data:'text';columns:Array<{name:string;pointer:string;type:'text';missing:'error'}>}};
export declare function exportSubscriptionCustomer(directory:string,options:SelectedCustomerExport&{title?:string}):Promise<CustomerExport>;
export declare function restoreSubscriptionAnalytical(input:{directory:string;sourceManifest:string;expectedSha256:string}):Promise<RestoredCustomer&{schema:string;rows:number}>;
export interface ConnectionEntry {label:string;directory:string}
export interface SubscriptionConnection {
 schema:'stellar-forge.odata-subscription-connection.v1';label:string;source:FileIdentity&{path:string};
 publishers:Record<string,ConnectionEntry>;customers:Record<string,ConnectionEntry>;
 collections:Record<string,ConnectionEntry&{sha256:string}>;
 inputs:Record<string,ConnectionEntry&{sha256:string;kind:'transfer'|'publisher-backup'|'customer-backup'|'analysis'}>;exportsDirectory:string;
}
export interface OperatorStatus {
 schema:'stellar-forge.odata-subscription-operator.v1';configured:boolean;label:string;pending:number;closing:boolean;connectionSha256:string;operations:string[];
 publishers:Record<string,{label:string}>;customers:Record<string,{label:string}>;
 collections:Record<string,{label:string;sha256:string}>;inputs:Record<string,{label:string;sha256:string;kind:string}>;
}
export interface ArtifactRecord {schema:'stellar-forge.odata-subscription-artifact.v1';artifact:string;kind:'transfer'|'original'|'publisher-backup'|'customer-backup'|'analysis';state:'COMPLETE';selection:Record<string,Json>;manifest:FileEntry;files:FileEntry[];bytesTotal:number;result:Record<string,unknown>;reused?:boolean}
export type InputSelection={input:string;artifact?:never}|{artifact:string;input?:never};
export interface OperatorRequests {
 status:Record<string,never>;
 'publisher-create':Omit<CreateRequest,'directory'|'collectionDirectory'|'collectionSha256'>&{publisher:string;collection:string};
 'publisher-append':Omit<AppendRequest,'directory'|'collectionDirectory'|'collectionSha256'>&{publisher:string;collection:string};
 'publisher-inspect':{publisher:string};'publisher-editions':{publisher:string;offset?:number;limit?:number};
 'publisher-rows':{publisher:string;revision?:number;kind?:'rows'|'changes';offset?:number;limit?:number};
 'publisher-cancel':{publisher:string;requestId:string};'publisher-delivery':{publisher:string;artifact:string;fromRevision?:number;toRevision:number};
 'publisher-source':{publisher:string;artifact:string;revision:number};'publisher-backup':{publisher:string;artifact:string;expectedRevision:number};
 'publisher-restore':{publisher:string}&InputSelection;'customer-receive':{customer:string}&InputSelection;
 'customer-inspect':{customer:string};'customer-rows':{customer:string;offset?:number;limit?:number};
 'customer-export':{customer:string;artifact:string;expectedRevision:number;expectedEditionSha256:string;title?:string};
 'customer-backup':{customer:string;artifact:string;expectedRevision:number;expectedEditionSha256:string};
 'customer-restore':{customer:string}&InputSelection;'analysis-mapping':{customer:string;source:string;sourceRevision:number};
 artifacts:{offset?:number;limit?:number};artifact:{artifact:string};
}
export interface OperatorResults {
 status:OperatorStatus;'publisher-create':AppendReceipt;'publisher-append':AppendReceipt;'publisher-inspect':PublisherInspection;
 'publisher-editions':Awaited<ReturnType<typeof subscriptionEditions>>;'publisher-rows':Awaited<ReturnType<typeof subscriptionRows>>;
 'publisher-cancel':Awaited<ReturnType<typeof cancelSubscriptionRequest>>;'publisher-delivery':ArtifactRecord;'publisher-source':ArtifactRecord;
 'publisher-backup':ArtifactRecord;'publisher-restore':Awaited<ReturnType<typeof restoreSubscription>>;'customer-receive':CustomerReceipt&{reused:boolean};
 'customer-inspect':CustomerInspection;'customer-rows':RowPage<SubscriptionRow>;'customer-export':ArtifactRecord;'customer-backup':ArtifactRecord;
 'customer-restore':RestoredCustomer;'analysis-mapping':ReturnType<typeof subscriptionAnalysisMapping>;artifacts:Page<ArtifactRecord|Record<string,unknown>>;artifact:ArtifactRecord;
}
export declare const CONNECTION_SCHEMA:'stellar-forge.odata-subscription-connection.v1';
export declare const OPERATIONS:ReadonlyArray<keyof OperatorRequests>;
export declare function readSubscriptionConnection(path:string):Promise<SubscriptionConnection>;
export declare class SubscriptionOperator {
 constructor(connection:SubscriptionConnection);
 readonly configuration:SubscriptionConnection;
 readonly summary:{configured:boolean;label:string;pending:number;closing:boolean};
 status():Promise<OperatorStatus>;
 call<K extends keyof OperatorRequests>(operation:K,args:OperatorRequests[K]):Promise<OperatorResults[K]>;
 artifactFile(input:{artifact:string;path:string;expectedSha256:string}):Promise<{readonlyFileHandle:FileHandle;bytes:number;sha256:string;name:string;type:string}>;
 close():Promise<void>;
}
export declare function openSubscriptionOperator(options:{connection:string|SubscriptionConnection}):Promise<SubscriptionOperator>;
export declare function subscriptionHttpHandler(options:{operator:SubscriptionOperator;basePath?:string}):(req:IncomingMessage,res:ServerResponse,url:URL)=>Promise<boolean>;
export declare function startSubscriptionServer(options:{connection?:string|SubscriptionConnection;operator?:SubscriptionOperator;port?:number}):Promise<{server:Server;url:string;operator:SubscriptionOperator;close():Promise<void>}>;
