import type { MppProductClient } from '../../../products/mpp-workspace/client.mjs';
export type ChannelOperation =
 'task-template'|'task-save'|'task-authorize'|'task-authority-resume'|'task-stop'|
 'purchase-prepare'|'purchase-execute'|'purchase-resume'|'purchase-refresh'|'purchase-cancel'|
 'merchant-save'|'merchant-start'|'merchant-stop'|'delivery-recover'|
 'close-prepare'|'close-execute'|'close-resume'|'close-reconcile'|'close-cancel'|
 'contract-fetch'|'export'|'receive';
export type ChannelRecord = Record<string,unknown>;
export type ChannelJob = {id?:string;state:string;result?:ChannelRecord;error?:string};
export type ChannelBytes = {bytes:Uint8Array;contentType:string|null;sha256:string;responseHeaders:Record<string,string>};
export type ChannelWorkInput = {schema:'stellar-forge.mpp-channel-work.v1';purchases:Array<{
 taskId:string;purchaseId:string;request:{url:string;method:'GET'|'POST';json?:unknown;query?:Record<string,string>};
}>};
export const actions:readonly ChannelOperation[];
export class MppChannelClient {
 constructor(product:MppProductClient);
 product:MppProductClient;
 identity():Promise<ChannelRecord>;
 state():Promise<ChannelRecord>;
 record(kind:'tasks'|'purchases'|'contracts',key:string):Promise<ChannelRecord>;
 response(purchaseId:string):Promise<ChannelBytes>;
 job(jobId:string):Promise<ChannelJob>;
 handover(sha256:string):Promise<ChannelBytes>;
 invoke(name:ChannelOperation,input?:ChannelRecord,options?:{waitMs?:number}):Promise<ChannelJob>;
 runPurchases(document:ChannelWorkInput,options?:{waitMs?:number}):Promise<ChannelRecord>;
 close():Promise<void>;
}
export function connectMppChannel(options:{directory:string;fetchImpl?:typeof fetch;timeoutMs?:number}):Promise<MppChannelClient>;
