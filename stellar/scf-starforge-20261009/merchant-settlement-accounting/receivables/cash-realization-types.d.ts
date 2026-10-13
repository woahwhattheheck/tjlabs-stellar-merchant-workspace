// MIT. Exact dated source and immutable receipt-plan realization.
import type {Currency,DateOnly,Money,InvoiceSummary,InvoiceDocument,Receipt,Allocation,CreditRecord,MutationContext,MutationResult,HistoryEntry} from './client.d.ts';
import type {CashPlanEdition,CashPlanInvoice} from './cash-planning-types.d.ts';
export interface CashRealizationInput {planId:string;editionId:string;through:DateOnly;note?:string}
export interface CashRealizationRequest extends Required<CashRealizationInput> {}
export interface CashRealizationIssue {code:string;message:string;invoiceId?:string;invoiceNumber?:string|null}
export interface CashRealizationSourceInvoice {
 id:string;document:InvoiceDocument;draft:Record<string,unknown>;version:number;status:string;
 voidDate?:DateOnly|null;voidReason?:string;history:HistoryEntry[];[key:string]:unknown;
}
export interface CashRealizationSourceReceipt {
 id:string;customerId:string;currency:Currency;amount:Money;receivedDate:DateOnly;accountingDate?:DateOnly;
 voidDate?:DateOnly|null;reference:string;[key:string]:unknown;
}
export interface CashRealizationSource {
 schema:'stellar-forge.merchant-cash-realization-source.v1';
 invoices:CashRealizationSourceInvoice[];credits:CreditRecord[];receipts:CashRealizationSourceReceipt[];
 allocations:Allocation[];refunds:Array<Record<string,unknown>>;
}
export interface CashRealizationCurrency {
 currency:Currency;invoices:number;plannedOpening:Money;openingCorrection:Money;allocationChange:Money;
 creditChange:Money;lifecycleChange:Money;currentBalance:Money;currentAmountDue:Money;currentCreditBalance:Money;
 expectedToDate:Money;incomingAllocatedCash:Money;olderCashAllocationChange:Money;incomingReceiptValue:Money;
 incomingUnallocatedValue:Money;receiptRefunds:Money;unreconciledRefunds:Money;cashVariance:Money;
}
export interface CashRealizationInvoice {
 invoiceId:string;invoiceNumber:string|null;customerId:string;customerName:string;currency:Currency;
 saved:CashPlanInvoice;opening:InvoiceSummary;current:InvoiceSummary;plannedOpening:Money;openingCorrection:Money;
 allocationChange:Money;creditChange:Money;lifecycleChange:Money;currentBalance:Money;expectedToDate:Money;
 incomingAllocatedCash:Money;olderCashAllocationChange:Money;cashVariance:Money;issues:CashRealizationIssue[];
}
export interface CashRealizationReceipt {
 receiptId:string;reference:string;customerId:string;currency:Currency;receivedDate:DateOnly;accountingDate:DateOnly;
 voidDate:DateOnly|null;classification:'NEW_INCOMING_CASH'|'EARLIER_RECEIPT'|'OUTSIDE_REVIEW_OR_REVERSED';
 amount:Money;incomingReceiptValue:Money;plannedInvoiceAllocation:Money;otherInvoiceAllocation:Money;
 incomingAllocatedCash:Money;refundChange:Money;opening:Receipt;current:Receipt;allocationIds:string[];
}
export interface CashRealizationEvent {
 kind:'ALLOCATION'|'ALLOCATION_RELEASE'|'CREDIT'|'INVOICE_VOID';date:DateOnly;invoiceId:string;
 invoiceNumber:string|null;customerId:string;currency:Currency;amount:Money;allocationId?:string;
 receiptId?:string;receivedDate?:DateOnly;accountingDate?:DateOnly;creditId?:string;reason:string;
}
export interface CashRealizationDate {
 currency:Currency;date:DateOnly;expected:Money;incomingAllocatedCash:Money;allocationChange:Money;
 creditChange:Money;cashVariance:Money;cumulativeExpected:Money;cumulativeIncomingAllocatedCash:Money;cumulativeVariance:Money;
}
export interface CashRealizationReport {
 schema:'stellar-forge.merchant-cash-realization.v1';request:CashRealizationRequest;plan:CashPlanEdition;
 baseDate:DateOnly;through:DateOnly;policy:{baseline:string;cash:string;corrections:string;attribution:string;refunds:string;periods:string};
 source:CashRealizationSource;sourceSha256:string;invoices:CashRealizationInvoice[];receipts:CashRealizationReceipt[];
 events:CashRealizationEvent[];dates:CashRealizationDate[];currencies:CashRealizationCurrency[];issues:CashRealizationIssue[];
}
export interface CashRealizationPreviewInput extends CashRealizationInput {workspaceId:string}
export interface CashRealizationPreview {
 workspaceId:string;revision:number;request:CashRealizationRequest;report:CashRealizationReport;reviewSha256:string;
}
export interface CashRealizationRecord {
 schema:'stellar-forge.merchant-cash-realization-record.v1';id:string;createdAt:string;actor:string;workspaceId:string;
 sourceRevision:number;request:CashRealizationRequest;report:CashRealizationReport;reviewSha256:string;
}
export interface CashRealizationSummary {
 id:string;planId:string;editionId:string;planTitle:string;editionNumber:number;baseDate:DateOnly;through:DateOnly;
 createdAt:string;actor:string;sourceRevision:number;reviewSha256:string;currencies:CashRealizationCurrency[];
 issueCount:number;note:string;
}
export interface CashRealizationListQuery {planId?:string}
export interface CashRealizationList {workspaceId:string;revision:number;realizations:CashRealizationSummary[]}
export interface CashRealizationDetail {workspaceId:string;revision:number;realization:CashRealizationRecord}
export interface SaveCashRealizationInput extends MutationContext,CashRealizationPreviewInput {reviewSha256:string}
export interface CashRealizationMutationResult extends MutationResult {
 workspaceId:string;cashRealization:CashRealizationSummary;realization:CashRealizationRecord;
}
export interface CashRealizationOperationResult {
 workspaceId:string;revision:number;operation:MutationResult['operation']|null;
 cashRealization?:CashRealizationSummary;realization?:CashRealizationRecord;
}
export type CashRealizationFileName='realization.json'|'realization.html'|'invoices.csv'|'dates.csv'|'events.csv'|'receipts.csv'|'manifest.json';
