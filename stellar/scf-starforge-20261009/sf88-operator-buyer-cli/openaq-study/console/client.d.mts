/// <reference types="node" />
import type {OpenAQHandoff,BuyerInspection,Accounting,DeliveryManifest,ReceivedDelivery,NativeRecord} from '../index.mjs';
export interface CustomerSelection{
 intentId:string;acceptIndex:number;query?:string;maxPages:number;maxTotalAtomic:string;maxRows?:number;maxPageBytes?:number;
}
export interface SelectionReview{
 schema:string;consoleId:string;consoleConfigurationSha256:string;handoffSha256:string;
 operatorConfigurationSha256:string;selection:CustomerSelection;release:OpenAQHandoff['release'];
 snapshot:string;capture:OpenAQHandoff['capture'];sourceReview:OpenAQHandoff['sourceReview'];
 originalRequest:NativeRecord;originalRequestSha256:string;reviewSha256:string;
}
export type CustomerAction='prepare'|'resumePreparation'|'run'|'recover'|'account'|'finalize'|'deliver'|'export'|'receive'|'reopen'|'inspect';
export interface CustomerJob{
 id:string;action:CustomerAction;input:NativeRecord;state:'RUNNING'|'COMPLETE'|'ERROR';
 createdAt:string;completedAt:string|null;result:unknown|null;error:{code:string}|null;
}
export interface OriginalApproval{
 id:string;intentId:string;state:'AWAITING_OPERATOR'|'APPROVING';createdAt:string;expiresAt:string;
 review:NativeRecord & {request_id:string;request_sha256:string;complete_original_accepted_terms:NativeRecord};
 current_native_budget_estimate:NativeRecord;
}
export interface CustomerView{
 schema:string;id:string;label:string;mode:'acquire'|'receive'|'inspect';configurationSha256:string;
 paths:{directory:string;customer:string;received:string;delivery:string};
 source:OpenAQHandoff|null;sourceFiles:Array<{name:string;bytes:number;sha256:string}>;
 deliveryFiles:Array<{name:string;bytes:number;sha256:string}>;selection:{value:NativeRecord;selection:CustomerSelection;requestSha256:string}|null;
 inspection:BuyerInspection|null;inspectionError:string|null;
 delivery:{directory:string;manifestSha256:string;manifest:DeliveryManifest;accounting:Accounting;[key:string]:unknown}|null;
 received:ReceivedDelivery|null;accounting:Accounting|null;active:CustomerJob|null;jobs:CustomerJob[];
 approvals:OriginalApproval[];capabilities:NativeRecord;
}
export interface ConnectionOptions{
 connectionFile:string;consoleId:string;configurationSha256:string;sourceSha256?:string;
}
export interface RequestOptions{signal?:AbortSignal}
export interface NativeContinuation{
 requestSha256:string;retryUnpaid?:boolean;retryExpired?:NativeRecord;expectedAttemptSha256?:string;
}
export function openOpenAQCustomer(options:ConnectionOptions):Promise<OpenAQCustomer>;
export class OpenAQCustomer{
 readonly identity:Readonly<{consoleId:string;instanceId:string;configurationSha256:string;sourceSha256:string}>;
 view(options?:RequestOptions):Promise<CustomerView>;
 review(selection:CustomerSelection,options?:RequestOptions):Promise<SelectionReview>;
 submit(id:string,action:CustomerAction,input?:NativeRecord,options?:RequestOptions):Promise<CustomerJob>;
 job(id:string,options?:RequestOptions):Promise<CustomerJob>;
 prepare(id:string,review:SelectionReview,options?:RequestOptions):Promise<CustomerJob>;
 resumePreparation(id:string,review:SelectionReview,options?:RequestOptions):Promise<CustomerJob>;
 run(id:string,input:NativeContinuation,options?:RequestOptions):Promise<CustomerJob>;
 recover(id:string,requestSha256:string,options?:RequestOptions):Promise<CustomerJob>;
 account(id:string,requestSha256:string,options?:RequestOptions & {finalize?:boolean}):Promise<CustomerJob>;
 deliver(id:string,requestSha256:string,options?:RequestOptions):Promise<CustomerJob>;
 export(id:string,input:{requestSha256:string;exportId:string},options?:RequestOptions):Promise<CustomerJob>;
 receive(id:string,input:{receivingId:string;manifestSha256:string},options?:RequestOptions):Promise<CustomerJob>;
 reopen(id:string,options?:RequestOptions):Promise<CustomerJob>;
 decide(input:{intent:string;approvalId:string;requestSha256:string;decision:'approve'|'reject'},options?:RequestOptions):Promise<NativeRecord>;
 cancel(id:string,options?:RequestOptions):Promise<CustomerJob>;
 rows(options?:RequestOptions & {limit?:number}):Promise<{manifestSha256:string;snapshot:string;totalRows:number;rows:NativeRecord[];semantics:unknown}>;
 wait(id:string,options?:RequestOptions & {intervalMs?:number}):Promise<CustomerJob>;
 download(options:RequestOptions & {kind:'source'|'delivery';name:string;sha256:string;bytes:number;limit?:number}):Promise<Uint8Array>;
 close():Promise<void>;
}
