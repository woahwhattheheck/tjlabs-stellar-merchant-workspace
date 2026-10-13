export type UUID = string;
export type DateOnly = string;
export interface Currency { code:string; scale:number }
export interface CustomerIdentity { id:UUID; name:string; reference?:string; [key:string]:unknown }
export interface InvoiceAccountRow {
 id:UUID; number:string; customerId:UUID; customerName:string; currency:Currency;
 total:string; paid:string; credited:string; amountDue:string; creditBalance:string;
 issueDate:DateOnly; dueDate:DateOnly; paymentStatus:string; [key:string]:unknown;
}
export interface CustomerAccount {
 schema:'stellar-forge.merchant-receivables-customer-export.v1'; asOf:DateOnly; customer:CustomerIdentity;
 currencies:Array<{currency:Currency;amountDue:string;creditBalance:string;unappliedPayments:string;reservedRefunds:string;refundedPayments:string;[key:string]:unknown}>;
 invoices:InvoiceAccountRow[]; credits:Array<Record<string,unknown>>; receipts:Array<Record<string,unknown>>;
 allocations:Array<Record<string,unknown>>; refunds:Array<Record<string,unknown>>; creditDispositions:Array<Record<string,unknown>>;
}
export interface AccountBinding {
 publicationId:UUID; workspaceId:string; customerId:UUID; sourceSha256:string; accountSha256:string; asOf:DateOnly;
}
export type CustomerResponseEntry =
 | {id:UUID;invoiceId:UUID;kind:'NOTE';note:string}
 | {id:UUID;invoiceId:UUID;kind:'PROMISE';note:string;amount:string;dueDate:DateOnly}
 | {id:UUID;invoiceId:UUID;kind:'DISPUTE';note:string;amount:string;category:'PRICING'|'DELIVERY'|'DUPLICATE'|'OTHER'}
 | {id:UUID;invoiceId:UUID;kind:'PAYMENT_NOTICE';note:string;amount:string;paymentDate:DateOnly;paymentReference:string};
export interface CustomerResponse {
 schema:'stellar-forge.merchant-customer-account-response.v1';id:UUID;account:AccountBinding;
 responseDate:DateOnly;author:{name:string;reference:string};previousResponseId?:UUID;items:CustomerResponseEntry[];
}
export interface FileIdentity {bytes:number;sha256:string;type?:string}
export interface PublicationInput {publicationId:UUID;customerId:UUID;asOf?:DateOnly}
export interface PublicationPreview extends PublicationInput {
 schema:'stellar-forge.merchant-customer-account-publication.v1';asOf:DateOnly;workspaceId:string;revision:number;
 account:CustomerAccount;accountSha256:string;sourceSha256:string;reviewSha256:string;
 files:Record<string,FileIdentity>;invoiceSources:Array<{invoiceId:UUID;documentSha256:string}>;
}
export interface Mutation {workspaceId:string;revision:number;actor:string;requestId:string;reviewSha256:string}
export interface PublicationSummary {
 schema:'stellar-forge.merchant-customer-account-publication.v1';id:UUID;customerId:UUID;customerName:string;
 asOf:DateOnly;createdAt:string;createdBy:string;sourceSha256:string;accountSha256:string;invoices:number;
 currencies:CustomerAccount['currencies'];files:string[];
}
export interface ResponseSummary {
 id:UUID;publicationId:UUID;customerId:UUID;customerName:string;receivedAt:string;receivedBy:string;responseDate:DateOnly;
 author:CustomerResponse['author'];version:number;items:number;completed:number;pending:number;status:'OPEN'|'REVIEWED';sourceSha256:string;
}
export interface ResponseIntakeInput {publicationId:UUID;responseText:string}
export interface ResponseIntakePreview {
 schema:'stellar-forge.merchant-customer-account-response.v1';workspaceId:string;revision:number;publication:PublicationSummary;
 response:CustomerResponse;sourceSha256:string;existingResponseId:UUID|null;reviewSha256:string;
}
export type Disposition='RECORD'|'ACKNOWLEDGE'|'DECLINE'|'DEFER';
export interface ResponseReviewInput {
 entryId:UUID;expectedVersion:number;disposition:Disposition;effectiveDate:DateOnly;reason:string;
 owner?:string;priority?:'NORMAL'|'HIGH'|'URGENT';title?:string;nextActionDate?:DateOnly;
 acknowledgeChanges?:boolean;reopenCase?:boolean;replaceOpenPromise?:boolean;resolveOpenDispute?:boolean;
}
export interface ResponseReviewPreview {
 schema:'stellar-forge.merchant-customer-account-response-review.v1';workspaceId:string;revision:number;responseId:UUID;
 responseVersion:number;responseSha256:string;publicationId:UUID;publicationSha256:string;customer:CustomerIdentity;
 entry:CustomerResponseEntry;originalInvoice:InvoiceAccountRow;currentInvoice:InvoiceAccountRow;changedFields:string[];
 collectionCase:Record<string,unknown>|null;choice:ResponseReviewInput;operations:Array<Record<string,unknown>>;reviewSha256:string;
}
export interface SavedDecision extends ResponseReviewInput {
 id:UUID;recordedAt:string;actor:string;reviewSha256:string;review:ResponseReviewPreview;collectionCaseId:UUID|null;collectionEventIds:UUID[];
}
export interface SavedResponse {
 id:UUID;publicationId:UUID;customerId:UUID;customerName:string;response:CustomerResponse;sourceSha256:string;version:number;
 receivedAt:string;receivedBy:string;decisions:SavedDecision[];directoryId:UUID;files:Record<string,FileIdentity>;
}
export interface ResponseDetail {workspaceId:string;revision:number;response:SavedResponse;publication:PublicationSummary;account:CustomerAccount;
 currentInvoices:Array<{invoiceId:UUID;collectionCaseId:UUID|null}>}
export interface OperationResult {
 revision:number;workspaceId:string;customerAccount?:PublicationSummary;customerResponse?:ResponseSummary;customerResponseDecision?:SavedDecision;
 operation:{id:string;action:string;actor:string;at:string;intentSha256:string;result:Record<string,unknown>;replayed?:boolean};
 [key:string]:unknown;
}
export interface CustomerAccountResponseClient {
 customerAccountResponses(query?:{customerId?:UUID;search?:string}):Promise<{workspaceId:string;revision:number;publications:PublicationSummary[];responses:ResponseSummary[]}>;
 previewCustomerAccount(value:PublicationInput):Promise<PublicationPreview>;
 publishCustomerAccount(value:PublicationInput&Mutation):Promise<OperationResult>;
 previewCustomerResponse(value:ResponseIntakeInput):Promise<ResponseIntakePreview>;
 receiveCustomerResponse(value:ResponseIntakeInput&Mutation):Promise<OperationResult>;
 customerResponse(id:UUID):Promise<ResponseDetail>;
 previewCustomerResponseReview(id:UUID,value:ResponseReviewInput):Promise<ResponseReviewPreview>;
 reviewCustomerResponse(id:UUID,value:ResponseReviewInput&Mutation):Promise<OperationResult>;
 customerAccountFile(id:UUID,name:string):Promise<Response>;
 customerResponseFile(id:UUID,name:string):Promise<Response>;
 customerAccountOperation(requestId:string):Promise<{workspaceId:string;revision:number;operation:OperationResult['operation']|null;[key:string]:unknown}>;
}
export declare function createCustomerAccountResponseClient(options?:{
 baseUrl?:string;fetchImpl?:typeof fetch;expectedWorkspaceId?:string;expectedSourcesSha256?:string;
}):Readonly<CustomerAccountResponseClient>;
