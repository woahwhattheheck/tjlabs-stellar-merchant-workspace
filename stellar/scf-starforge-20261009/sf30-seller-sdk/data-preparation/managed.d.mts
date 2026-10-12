import type {ReceivedPreparation} from './connection.mjs';
export interface PreparationManagedOptions {directory:string;port:number;label:string;workspaceSha256?:string}
export function preparationManagedOptions(args:string[]):PreparationManagedOptions;
export function preparationPython():string;
export function runManagedPreparation(args?:string[]):Promise<number>;
export function runPreparationNative(args:string[],options?:{signal?:AbortSignal;maxOutputBytes?:number}):Promise<unknown>;
export function receivePreparationWorkspace(options:{
 archive:string;directory:string;expectedSha256:string;maxBytes?:number;signal?:AbortSignal;
}):Promise<ReceivedPreparation>;
export function inspectReceivedPreparation(directory:string,options?:{signal?:AbortSignal;maxOutputBytes?:number}):Promise<ReceivedPreparation>;
