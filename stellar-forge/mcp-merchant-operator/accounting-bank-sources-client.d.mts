/** Exact configured Bank source artifacts; no financial mutation methods. */
export type Sha256=string;
export type UUID=string;
export type Json=null|boolean|number|string|Json[]|{[key:string]:Json};
export interface CallOptions {requestSignal?:AbortSignal;timeoutMs?:number}
export interface FileOptions {signal?:AbortSignal;chunkBytes?:number}
export interface SourceMapping {
 format:'OFX'|'QFX'|'CAMT053'|'CSV';
 columns:Record<string,Json>;
 [key:string]:Json;
}
export type SourceInput={
 key:string;name:string;bytes:number;sha256:Sha256
}&({sourceAlias:string;preparationId?:never;file?:never}|{preparationId:UUID;file:string;sourceAlias?:never});
export interface SourceItem {id:UUID;sourceKey:string;mapping:SourceMapping;included:boolean;note:string}
export interface SourceItemEdit {id:UUID;mapping?:SourceMapping;included?:boolean;note?:string}
export interface SourceRequestBase {workspaceId:Sha256;requestId:UUID;actor:string;inputs:SourceInput[]}
export type SourceRequest=SourceRequestBase&(
 |{kind:'collection_prepare';parameters:{collectionId:UUID;name:string;files:SourceItem[]}}
 |{kind:'collection_edit';parameters:{expectedRevision:number;name?:string;items:SourceItemEdit[]}}
 |{kind:'collection_receive';parameters:{collectionId:UUID}}
 |{kind:'collection_inspect';parameters:Record<string,never>}
 |{kind:'profile_save';parameters:{libraryId:UUID;profileId:UUID;expectedRevision:number;expectedVersion:number;name:string;reason:string;mapping:SourceMapping}}
 |{kind:'profile_receive';parameters:{libraryId:UUID;expectedRevision:number}}
 |{kind:'profile_review';parameters:{profileId:UUID;version:number;itemIds:UUID[]}}
 |{kind:'profile_apply';parameters:Record<string,never>}
);
export interface RetainedFile {name:string;bytes:number;sha256:Sha256;role:'request'|'input'|'output'|'result'}
export interface RetainedInput {key:string;name:string;bytes:number;sha256:Sha256;file:string}
export interface WorkspaceEnvelope {workspace:string;workspaceId:Sha256}
export interface SourceReceipt extends WorkspaceEnvelope {
 schema:'stellar-forge.accounting-bank-source-preparation.v1';
 preparationId:UUID;requestSha256:Sha256;sourceSha256:Sha256;
 kind:SourceRequest['kind'];actor:string;createdAt:string;
 state:'RETAINING'|'PREPARED'|'COMPLETE';inputs:RetainedInput[];files:RetainedFile[];
 summary:Record<string,Json>|null;
 viewType:'collection'|'library'|'inspection'|'profile-review'|null;
 lastFailure?:{code:string;message:string;at:string};
}
export interface MissingPreparation extends WorkspaceEnvelope {preparationId:UUID;state:'NOT_FOUND'}
export type PreparationObservation=SourceReceipt|MissingPreparation;
export interface SourcePin extends WorkspaceEnvelope {sourceAlias:string;name:string;bytes:number;sha256:Sha256}
export interface SourceStatus extends WorkspaceEnvelope {configuredSources:string[];limits:Record<string,Json>;sourceSha256:Sha256}
export interface Page<T> {offset:number;limit:number;total:number;items:T[]}
export interface ListArguments {offset?:number;limit?:number}
export interface SourceList extends WorkspaceEnvelope {inventorySha256:Sha256;page:Page<SourceReceipt>}
export interface ViewArguments extends ListArguments {
 preparationId:UUID;itemId?:UUID;profileId?:UUID;
 section?:'items'|'statements'|'rows'|'pending'|'excluded'|'issues';
 statementId?:string;
}
export interface SourceView extends WorkspaceEnvelope {preparationId:UUID;view:Record<string,unknown>&{page:Page<Record<string,unknown>>}}
export interface RetainedChunk {
 readId:UUID;file:{name:string;bytes:number;sha256:Sha256;[key:string]:unknown};
 offset:number;nextOffset:number|null;encoding:'base64';data:string;bytesRead:number;
 bytes:Uint8Array;complete:boolean;
}
export interface BankSourceActionArguments {
 status:Record<string,never>;
 source:{sourceAlias:string;name:string};
 list:ListArguments;
 prepare:{request:SourceRequest};
 execute:{preparationId:UUID;expectedRequestSha256:Sha256};
 request:{preparationId:UUID};
 view:ViewArguments;
}
export interface BankSourceActionResults {
 status:SourceStatus;source:SourcePin;list:SourceList;
 prepare:SourceReceipt;execute:SourceReceipt;request:PreparationObservation;view:SourceView;
}
export type BankSourceAction=keyof BankSourceActionArguments;
export const ACCOUNTING_BANK_SOURCES_METHODS:readonly BankSourceAction[];
export function accountingBankSourcesArguments<K extends BankSourceAction>(action:K,value:BankSourceActionArguments[K]):BankSourceActionArguments[K];
export function validateAccountingBankSourceReceipt(value:unknown,options?:{request?:SourceRequest;workspaceId?:Sha256}):SourceReceipt;
export interface AccountingBankSourcesClient {
 readonly workspace:string;readonly endpoint?:string;
 open(options?:CallOptions):Promise<Record<string,unknown>>;
 callOperation<K extends BankSourceAction>(action:K,args:BankSourceActionArguments[K],options?:CallOptions):Promise<BankSourceActionResults[K]>;
 status(args?:Record<string,never>,options?:CallOptions):Promise<SourceStatus>;
 source(args:{sourceAlias:string;name:string},options?:CallOptions):Promise<SourcePin>;
 list(args?:ListArguments,options?:CallOptions):Promise<SourceList>;
 prepare(args:{request:SourceRequest},options?:CallOptions):Promise<SourceReceipt>;
 execute(args:{preparationId:UUID;expectedRequestSha256:Sha256},options?:CallOptions):Promise<SourceReceipt>;
 request(args:{preparationId:UUID},options?:CallOptions):Promise<PreparationObservation>;
 view(args:ViewArguments,options?:CallOptions):Promise<SourceView>;
 reconcileRequest(request:SourceRequest,options?:CallOptions):Promise<PreparationObservation>;
 listAll(options?:CallOptions):Promise<SourceList>;
 viewAll(args:Omit<ViewArguments,'offset'|'limit'>,options?:CallOptions):Promise<SourceView>;
 /** Exact receipt pin governs every chunk; breaking iteration releases its original read. */
 fileChunks(receipt:SourceReceipt,file:string,options?:FileOptions):AsyncGenerator<RetainedChunk,void,unknown>;
 fileBytes(receipt:SourceReceipt,file:string,options?:FileOptions&{maximumBytes?:number}):Promise<{bytes:Uint8Array;file:RetainedChunk['file']}>;
 registerFileRead(readId:UUID):unknown;
 releaseFile(readId:UUID,options?:CallOptions):Promise<unknown>;
 drainFileReads():Promise<unknown>;
 /** Drain only this caller's reads; keep the shared accounting owner open. */
 disconnect():Promise<unknown>;
 /** Explicitly close the existing shared accounting owner after draining reads. */
 closeWorkspace(options?:CallOptions):Promise<unknown>;
}
export function createAccountingBankSourcesClient(options:{
 workspace:string;call:(name:string,args:Record<string,unknown>,options?:CallOptions)=>Promise<Record<string,unknown>>;
}):AccountingBankSourcesClient;
export function connectAccountingBankSourcesClient(options:{
 workspace:string;url?:string;bearerToken?:string;tokenEnv?:string;environment?:Record<string,string|undefined>;
 maximumResponseBytes?:number;signal?:AbortSignal;[key:string]:unknown;
}):Promise<AccountingBankSourcesClient>;
