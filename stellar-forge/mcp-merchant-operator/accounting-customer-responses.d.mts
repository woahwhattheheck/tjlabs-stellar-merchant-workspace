import type * as Account from '../../stellar/scf-starforge-20261009/merchant-settlement-accounting/receivables/customer-account-client.d.ts';
import type {ReceivablesCallOptions,ReceivablesFileOptions,ReceivablesFileMetadata} from './accounting-receivables-client.mjs';
export type {Account};
export interface CustomerAccountIntakePreview extends Account.ResponseIntakePreview {
  source:Account.ResponseIntakeInput;
}
export type CustomerAccountIntakeSelection =
  {publicationId:string;responseText:string;responseSource?:never} |
  {publicationId:string;responseSource:string;responseText?:never};
export interface CustomerAccountArgumentsMap {
  customer_account_list:{customerId?:string;search?:string};
  customer_account_preview:Account.PublicationInput;
  customer_account_publish:Account.PublicationInput&Account.Mutation;
  customer_response_preview:CustomerAccountIntakeSelection;
  customer_response_receive:Account.ResponseIntakeInput&Account.Mutation;
  customer_response_detail:{customerResponseId:string};
  customer_response_review_preview:Account.ResponseReviewInput&{customerResponseId:string};
  customer_response_review:Account.ResponseReviewInput&Account.Mutation&{customerResponseId:string};
}
export interface CustomerAccountResultsMap {
  customer_account_list:{workspaceId:string;revision:number;publications:Account.PublicationSummary[];responses:Account.ResponseSummary[]};
  customer_account_preview:Account.PublicationPreview;
  customer_account_publish:Account.OperationResult;
  customer_response_preview:CustomerAccountIntakePreview;
  customer_response_receive:Account.OperationResult;
  customer_response_detail:Account.ResponseDetail;
  customer_response_review_preview:Account.ResponseReviewPreview;
  customer_response_review:Account.OperationResult;
}
export type CustomerAccountMutation='customer_account_publish'|'customer_response_receive'|'customer_response_review';
export interface CustomerAccountMethods {
  customerAccountResponses:'customer_account_list';
  previewCustomerAccount:'customer_account_preview';
  publishCustomerAccount:'customer_account_publish';
  previewCustomerResponse:'customer_response_preview';
  receiveCustomerResponse:'customer_response_receive';
  customerResponse:'customer_response_detail';
  previewCustomerResponseReview:'customer_response_review_preview';
  reviewCustomerResponse:'customer_response_review';
}
export type CustomerAccountFileSelection=
  {kind:'receivables-customer-account';publicationId:string;file:string}|
  {kind:'receivables-customer-response';customerResponseId:string;file:string};
export interface CustomerAccountClient {
  customerAccountResponses(args?:CustomerAccountArgumentsMap['customer_account_list'],options?:ReceivablesCallOptions):Promise<CustomerAccountResultsMap['customer_account_list']>;
  previewCustomerAccount(args:Account.PublicationInput,options?:ReceivablesCallOptions):Promise<Account.PublicationPreview>;
  publishCustomerAccount(args:CustomerAccountArgumentsMap['customer_account_publish'],options?:ReceivablesCallOptions):Promise<Account.OperationResult>;
  previewCustomerResponse(args:CustomerAccountIntakeSelection,options?:ReceivablesCallOptions):Promise<CustomerAccountIntakePreview>;
  receiveCustomerResponse(args:CustomerAccountArgumentsMap['customer_response_receive'],options?:ReceivablesCallOptions):Promise<Account.OperationResult>;
  customerResponse(args:CustomerAccountArgumentsMap['customer_response_detail'],options?:ReceivablesCallOptions):Promise<Account.ResponseDetail>;
  previewCustomerResponseReview(args:CustomerAccountArgumentsMap['customer_response_review_preview'],options?:ReceivablesCallOptions):Promise<Account.ResponseReviewPreview>;
  reviewCustomerResponse(args:CustomerAccountArgumentsMap['customer_response_review'],options?:ReceivablesCallOptions):Promise<Account.OperationResult>;
  customerAccountFile(args:Omit<Extract<CustomerAccountFileSelection,{kind:'receivables-customer-account'}>,'kind'>,
    options?:ReceivablesFileOptions&{maximumBytes?:number}):Promise<{bytes:Uint8Array;file:ReceivablesFileMetadata}>;
  customerResponseFile(args:Omit<Extract<CustomerAccountFileSelection,{kind:'receivables-customer-response'}>,'kind'>,
    options?:ReceivablesFileOptions&{maximumBytes?:number}):Promise<{bytes:Uint8Array;file:ReceivablesFileMetadata}>;
}
export declare const CUSTOMER_ACCOUNT_METHODS:Readonly<CustomerAccountMethods>;
export declare const CUSTOMER_ACCOUNT_SELECTORS:Readonly<Record<string,'customerResponseId'>>;
export declare const CUSTOMER_ACCOUNT_ACTIONS:Readonly<Record<CustomerAccountMutation,string>>;
export declare const CUSTOMER_ACCOUNT_FILE_KINDS:readonly ['receivables-customer-account','receivables-customer-response'];
export declare const CUSTOMER_ACCOUNT_FILE_NAMES:readonly string[];
export declare function customerAccountInvocation(operation:keyof CustomerAccountArgumentsMap,input:Record<string,unknown>):{method:keyof CustomerAccountMethods;arguments:unknown[]};
export declare function callCustomerAccount(receivables:object,operation:keyof CustomerAccountArgumentsMap,input:Record<string,unknown>,
  readSource?:(alias:string,maximumBytes:number)=>Promise<Uint8Array>):Promise<unknown>;
export declare function customerAccountFile(receivables:object,input:CustomerAccountFileSelection):Promise<{name:string;type:string;bytes:Uint8Array}>;
