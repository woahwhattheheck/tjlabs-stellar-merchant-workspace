import type{InvoiceMerchantClient}from './invoice-settlement-client.mjs';
export interface PublicationOptions {directory:string;publicationId:string;expectedManifestSha256?:string;signal?:AbortSignal}
export const INVOICE_PUBLICATION_MANIFEST:string;export const INVOICE_PUBLICATION_SCHEMA:string;
export const INVOICE_PUBLICATION_LIMITS:Readonly<{files:number;fileBytes:number;totalBytes:number;manifestBytes:number;checkpointBytes:number}>;
export function parseInvoicePublication(bytes:Uint8Array,publicationId:string):any;
export function inspectInvoicePublication(options:{client:InvoiceMerchantClient;publicationId:string;signal?:AbortSignal}):Promise<any>;
export function downloadInvoicePublication(options:PublicationOptions&{client:InvoiceMerchantClient;chunkSize?:number;onProgress?:(progress:any)=>void}):Promise<any>;
export function verifyInvoiceDownload(options:PublicationOptions):Promise<any>;
export function receiveInvoicePackage(options:PublicationOptions&{destination:string;requestId:string}):Promise<any>;
