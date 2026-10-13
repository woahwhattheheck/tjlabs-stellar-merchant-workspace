import type{InvoiceMerchantClient,JSONObject}from './invoice-settlement-client.mjs';
export interface InvoiceCustomerConnection {schema:string;url:string;tokenEnv:string;workspace:string;workspaceId:string|null;maximumResponseBytes:number}
export const INVOICE_CUSTOMER_CONNECTION_SCHEMA:string;export const INVOICE_CUSTOMER_OPERATION_SCHEMA:string;
export function invoiceOperationBytes(value:unknown):Uint8Array;
export function invoiceCustomerConnectionTemplate():InvoiceCustomerConnection;
export function normalizeInvoiceCustomerConnection(value:unknown,options?:{requireWorkspaceId?:boolean}):InvoiceCustomerConnection;
export function readInvoiceCustomerJson(path:string,maximum?:number):Promise<{value:any;bytes:Uint8Array;identity:{bytes:number;sha256:string}}>;
export function prepareInvoiceOperation(options:{directory:string;operationId:string;connection:InvoiceCustomerConnection;tool:string;arguments?:JSONObject}):Promise<any>;
export function showInvoiceOperation(directory:string):Promise<any>;
export function executeInvoiceOperation(options:{directory:string;client?:InvoiceMerchantClient;environment?:Record<string,string|undefined>;signal?:AbortSignal;timeoutMs?:number;continueOriginal?:boolean}):Promise<any>;
export function bindInvoiceCustomerConnection(options:{connection:InvoiceCustomerConnection;client?:InvoiceMerchantClient;environment?:Record<string,string|undefined>;signal?:AbortSignal}):Promise<{connection:InvoiceCustomerConnection;observation:any}>;
