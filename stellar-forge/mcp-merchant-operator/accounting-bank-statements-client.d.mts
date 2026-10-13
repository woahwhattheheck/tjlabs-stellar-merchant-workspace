// MIT. Original bank source and money types are shared with the maintained native client.
import type {BankStatementsClient,BankState,BankResult,BankAccount,BankImport,BankClose,Reopening,
 SourcePreview,CamtAssemblyInput,CamtAssemblyPreview,CloseInput,ClosePreview,CloseDetail,
 TransactionPage,TransactionDetail,RequestIdentity,PostingInput,ReceiptInput,ResolveInput} from '../../stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/bank-statements/client.d.ts';
import type {BankStatementSourceInput,BankStatementSourceReport} from '../../stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/bank-statements/source.mjs';
export type BoundIdentity=RequestIdentity&{workspaceId:string};
export type Options={requestSignal?:AbortSignal;timeoutMs?:number};
export type FileSelection={kind:'bank-statements-import';bankStatementImportId:string;file:'original'|'parsed.json'}|
 {kind:'bank-statements-close';bankStatementCloseId:string;file:string};
export type FileIdentity={name:string;type?:string;bytes:number;sha256:string;readId?:string;[key:string]:unknown};
export type FileEntry=FileIdentity&{selection:FileSelection};
export type Reply<T>=T&{workspace:string;workspaceId:string};
export type BankPage<T>={items:T[];total:number;offset:number;limit:number;revision:number;workspaceId:string;workspace:string;view?:string};
export type StatusView='summary'|'accounts'|'imports'|'closes'|'reopenings'|'customers'|'periodCloses'|'history';
export type StatusArguments={view?:StatusView;accountId?:string;search?:string;offset?:number;limit?:number};
export type SourceInspection=Reply<SourcePreview>&{sourceInput:BankStatementSourceInput};
export type ReviewedClose=Reply<ClosePreview>&{closeInput:CloseInput};
export interface MethodArguments{
 status:StatusArguments;
 source_preview:{source:BankStatementSourceInput|Record<string,unknown>;sourceAlias?:string};
 account_save:BoundIdentity&{account:Parameters<BankStatementsClient['saveAccount']>[0]['account']};
 source_import:BoundIdentity&{accountId:string;statementId:string;source:BankStatementSourceInput;reviewSha256:string;supersedesImportId?:string;receiptIntakeAccountId?:string};
 transactions:NonNullable<Parameters<BankStatementsClient['transactions']>[0]>;
 transaction:{bankTransactionId:string};import:{bankStatementImportId:string};
 match:BoundIdentity&{bankTransactionId:string;parts:PostingInput[];reason:string};
 receipt:ReceiptInput&BoundIdentity&{bankTransactionId:string};
 undo:BoundIdentity&{bankTransactionId:string;reason:string};
 resolve:ResolveInput&BoundIdentity&{bankTransactionId:string};
 assembly_preview:CamtAssemblyInput;close_preview:CloseInput;
 close:BoundIdentity&CloseInput&{reviewSha256:string;name:string;note?:string};
 close_detail:{bankStatementCloseId:string};reopen:BoundIdentity&{bankStatementCloseId:string;reason:string};
 request_lookup:{requestId:string};
}
export type Mutation='account_save'|'source_import'|'match'|'receipt'|'undo'|'resolve'|'close'|'reopen';
export interface MethodResults{
 status:Reply<{schema?:string;revision:number;sourcesSha256:string;view:StatusView;counts?:Record<string,number>;currencies?:BankState['currencies'];
  items?:Array<BankAccount|BankImport|BankClose|Reopening|Record<string,unknown>>;total?:number;offset?:number;limit?:number}>;
 source_preview:SourceInspection;account_save:Reply<BankResult>;source_import:Reply<BankResult>;
 transactions:Reply<TransactionPage>;transaction:Reply<TransactionDetail>;
 import:Reply<{import:BankImport;report:Omit<BankStatementSourceReport,'bytes'>;revision:number;files:FileEntry[]}>;
 match:Reply<BankResult>;receipt:Reply<BankResult>;undo:Reply<BankResult>;resolve:Reply<BankResult>;
 assembly_preview:Reply<CamtAssemblyPreview>;close_preview:ReviewedClose;close:Reply<BankResult>;
 close_detail:Reply<CloseDetail>&{files:FileEntry[];archive:FileSelection;archiveScope:string};
 reopen:Reply<BankResult>;
 request_lookup:Reply<({found:true}&BankResult)|{found:false;revision:number;requestId:string}>;
}
export interface AccountingBankStatementsClient{
 readonly workspace:string;readonly endpoint?:string;
 open(options?:Options):Promise<Record<string,unknown>>;
 configuredSources(options?:Options):Promise<Record<string,unknown>>;
 callOperation<K extends keyof MethodArguments>(kind:K,args:MethodArguments[K],options?:Options):Promise<MethodResults[K]>;
 status(args?:StatusArguments,options?:Options):Promise<MethodResults['status']>;
 previewSource(args:MethodArguments['source_preview'],options?:Options):Promise<SourceInspection>;
 saveAccount(args:MethodArguments['account_save'],options?:Options):Promise<Reply<BankResult>>;
 receiveSource(args:MethodArguments['source_import'],options?:Options):Promise<Reply<BankResult>>;
 transactions(args?:MethodArguments['transactions'],options?:Options):Promise<Reply<TransactionPage>>;
 transaction(args:MethodArguments['transaction'],options?:Options):Promise<Reply<TransactionDetail>>;
 import(args:MethodArguments['import'],options?:Options):Promise<MethodResults['import']>;
 match(args:MethodArguments['match'],options?:Options):Promise<Reply<BankResult>>;
 receiveReceipt(args:MethodArguments['receipt'],options?:Options):Promise<Reply<BankResult>>;
 undo(args:MethodArguments['undo'],options?:Options):Promise<Reply<BankResult>>;
 resolve(args:MethodArguments['resolve'],options?:Options):Promise<Reply<BankResult>>;
 previewAssembly(args:CamtAssemblyInput,options?:Options):Promise<Reply<CamtAssemblyPreview>>;
 previewClose(args:CloseInput,options?:Options):Promise<ReviewedClose>;
 retainClose(args:MethodArguments['close'],options?:Options):Promise<Reply<BankResult>>;
 closeDetail(args:MethodArguments['close_detail'],options?:Options):Promise<MethodResults['close_detail']>;
 reopenClose(args:MethodArguments['reopen'],options?:Options):Promise<Reply<BankResult>>;
 request(args:MethodArguments['request_lookup'],options?:Options):Promise<MethodResults['request_lookup']>;
 listAll(kind:'status'|'transactions',args?:Record<string,unknown>,options?:Options):Promise<BankPage<unknown>>;
 reconcileOperation<K extends Mutation>(kind:K,args:MethodArguments[K],options?:Options):Promise<MethodResults['request_lookup']>;
 registerFileRead(readId:string):unknown;releaseFile(readId:string,options?:Options):Promise<unknown>;
 drainFileReads():Promise<unknown>;
 fileChunks(selection:FileSelection,options?:{expectedSha256?:string;chunkBytes?:number;signal?:AbortSignal}):AsyncGenerator<{bytes:Uint8Array;file:FileIdentity}>;
 fileBytes(selection:FileSelection,options?:{maximumBytes?:number;expectedSha256?:string;chunkBytes?:number;signal?:AbortSignal}):Promise<{bytes:Uint8Array;file:FileIdentity}>;
 disconnect():Promise<unknown>;closeWorkspace(options?:Options):Promise<unknown>;
}
export declare const ACCOUNTING_BANK_STATEMENTS_METHODS:Readonly<Record<string,keyof MethodArguments>>;
export declare const ACCOUNTING_BANK_STATEMENTS_MUTATIONS:readonly Mutation[];
export declare function accountingBankStatementsArguments<K extends Mutation>(kind:K,value:MethodArguments[K]):MethodArguments[K];
export declare function accountingBankStatementsImportArguments(inspection:SourceInspection,selection:Pick<MethodArguments['source_import'],'actor'|'requestId'|'accountId'|'statementId'|'supersedesImportId'|'receiptIntakeAccountId'>):MethodArguments['source_import'];
export declare function accountingBankStatementsCloseArguments(preview:ReviewedClose,operation:Pick<MethodArguments['close'],'actor'|'requestId'|'name'|'note'>):MethodArguments['close'];
export declare function createAccountingBankStatementsClient(options:{workspace:string;call:(name:string,args:Record<string,unknown>,options?:Options)=>Promise<Record<string,unknown>>}):AccountingBankStatementsClient;
export declare function connectAccountingBankStatementsClient(options:{url:string;workspace:string;bearerToken?:string;tokenEnv?:string;environment?:Record<string,string|undefined>;maximumResponseBytes?:number;signal?:AbortSignal}):Promise<AccountingBankStatementsClient>;
