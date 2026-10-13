import type {Account,CustomerAccountIntakePreview,CustomerAccountArgumentsMap} from './accounting-customer-responses.mjs';
export declare function accountingCustomerPublicationPreview(preview:unknown):Account.PublicationPreview;
export declare function accountingCustomerPublicationArguments(preview:Account.PublicationPreview,value:{actor:string;requestId:string}):CustomerAccountArgumentsMap['customer_account_publish'];
export declare function accountingCustomerResponsePreview(preview:unknown):CustomerAccountIntakePreview;
export declare function accountingCustomerResponseArguments(preview:CustomerAccountIntakePreview,value:{actor:string;requestId:string}):CustomerAccountArgumentsMap['customer_response_receive'];
export declare function accountingCustomerResponseReviewPreview(preview:unknown):Account.ResponseReviewPreview;
export declare function accountingCustomerResponseReviewArguments(preview:Account.ResponseReviewPreview,value:{actor:string;requestId:string}):CustomerAccountArgumentsMap['customer_response_review'];
