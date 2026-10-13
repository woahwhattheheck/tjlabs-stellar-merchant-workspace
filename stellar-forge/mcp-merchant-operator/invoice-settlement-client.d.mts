// MIT. Installed Invoice & Settlement customer types.
export type JSONValue=null|boolean|number|string|JSONValue[]|{[key:string]:JSONValue};
export type JSONObject={[key:string]:JSONValue};
export type InvoiceReadMethod="workspace.describe"|"workspace.history"|"request.status"|"programme.read"|"source.catalog"|"source.read"|"source.file"|"receipt.read"|"delivery.read"|"delivery.file"|"horizon.review"|"decision.read"|"edition.read"|"reconciliation.compare"|"report.read"|"report.file";
export type InvoiceChangeMethod="workspace.profile"|"programme.save"|"source.project"|"capture.start"|"capture.next"|"capture.run"|"capture.pause"|"capture.resume"|"delivery.prepare"|"delivery.next"|"delivery.pause"|"delivery.resume"|"delivery.resolve"|"delivery.run"|"delivery.run.pause"|"delivery.run.resume"|"horizon.apply"|"decision.save"|"reconciliation.create"|"report.create";
export interface NativeChange extends JSONObject {requestId:string;expectedRevision:number}
export interface RequestOptions {signal?:AbortSignal;timeoutMs?:number}
export interface NativeIdentity {id:string;revision:number}
export interface InvoiceReply {workspace:string;native?:NativeIdentity;value?:JSONObject;[key:string]:unknown}
export interface MerchantFileClient {endpoint:string;call(name:string,args:JSONObject,options?:{requestSignal?:AbortSignal|null;timeoutMs?:number}):Promise<JSONObject>}
export interface InvoiceClientOptions {client?:MerchantFileClient;workspace:string;workspaceId?:string;url?:string;tokenEnv?:string;environment?:Record<string,string|undefined>;signal?:AbortSignal;maximumResponseBytes?:number}
export interface ExportArguments {requestId:string;expectedRevision:number;kind:'workspace'|'report';reportId?:string;includeApplication?:boolean}
export interface SourceImportArguments {input:string;expectedSha256:string;args:NativeChange&{provider:'sdp'|'horizon'|'elementpay'|'evm'|'document';kind:string}}
export class InvoiceMerchantClient {
 constructor(options:{client:MerchantFileClient;workspace:string;workspaceId?:string});
 readonly endpoint:string;readonly workspace:string;readonly workspaceId:string|undefined;readonly closed:boolean;readonly activeFileReads:number;
 call(tool:string,args?:JSONObject,options?:RequestOptions):Promise<InvoiceReply>;
 workspaces(options?:RequestOptions):Promise<InvoiceReply>;open(options?:RequestOptions):Promise<InvoiceReply>;
 status(args?:JSONObject,options?:RequestOptions):Promise<InvoiceReply>;closeWorkspace(instanceId:string,options?:RequestOptions):Promise<InvoiceReply>;
 methods(options?:RequestOptions):Promise<InvoiceReply>;
 read(method:InvoiceReadMethod,args?:JSONObject,options?:RequestOptions):Promise<InvoiceReply>;
 change(method:InvoiceChangeMethod,args:NativeChange,options?:RequestOptions):Promise<InvoiceReply>;
 inputs(args?:{input?:string},options?:RequestOptions):Promise<InvoiceReply>;
 importSource(args:SourceImportArguments,options?:RequestOptions):Promise<InvoiceReply>;
 export(args:ExportArguments,options?:RequestOptions):Promise<InvoiceReply>;
 files(args:{publicationId:string},options?:RequestOptions):Promise<InvoiceReply>;
 fileRead(args:{publicationId:string;file:string;expectedSha256:string;readId?:string;offset?:number;limit?:number},options?:RequestOptions):Promise<InvoiceReply>;
 fileRelease(args:{readId:string},options?:RequestOptions):Promise<InvoiceReply>;
 history(args?:{limit?:number},options?:RequestOptions):Promise<{workspace:string;workspaceId:string;revision:number;complete:true;records:JSONObject[];pages:InvoiceReply[]}>;
 inspectPublication(publicationId:string,options?:RequestOptions):Promise<unknown>;
 downloadPublication(publicationId:string,directory:string,options?:Record<string,unknown>):Promise<unknown>;
 disconnect():Promise<void>;
}
export function openInvoiceMerchantClient(options:InvoiceClientOptions):Promise<InvoiceMerchantClient>;
export function invoiceTools():{name:string;description:string;inputSchema:JSONObject;annotations:{readOnlyHint:boolean;idempotentHint:boolean;openWorldHint:boolean}}[];
export function invoiceRequest(tool:string,args?:JSONObject,workspace?:string):{name:string;arguments:JSONObject};
export function invoiceToolName(tool:string):string;
export function invoiceReplayPolicy(tool:string,args?:JSONObject):{replayable:boolean;basis:string};
export function invoiceClientError(code:string,message:string,details?:unknown):Error&{code:string;details?:unknown};
export const INVOICE_MCP_CLIENT_SCHEMA:string;export const INVOICE_TOOL_PREFIX:string;export const MAX_RETAINED_CHUNK_BYTES:number;
