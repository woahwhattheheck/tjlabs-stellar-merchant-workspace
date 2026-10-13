// MIT.
import type {AccountingBankStatementsClient,Mutation,MethodArguments,FileSelection,FileIdentity} from './accounting-bank-statements-client.mjs';
export declare function prepareAccountingBankStatementsOperation<K extends Mutation>(options:{directory:string;url:string;workspace:string;tokenEnv?:string;kind:K;arguments:MethodArguments[K]}):Promise<{directory:string;kind:K;requestSha256:string;arguments:MethodArguments[K];phase:'PREPARED'}>;
export declare function runAccountingBankStatementsOperation(options:{directory:string;execute?:boolean;client?:AccountingBankStatementsClient;environment?:Record<string,string|undefined>;signal?:AbortSignal}):Promise<Record<string,unknown>>;
export declare function downloadAccountingBankStatementsFile(options:{client:AccountingBankStatementsClient;selection:FileSelection;expectedSha256?:string;output:string;chunkBytes?:number;maximumBytes?:number;signal?:AbortSignal}):Promise<{output:string;workspace:string;selection:FileSelection;file:FileIdentity;complete:true}>;
export declare function main(args?:string[]):Promise<unknown>;
