import type {PaymentPlanCollectionAvailability,PaymentPlanCollectionSelection,PaymentPlanCollectionSource,
  PaymentPlanCollectionStatus,PaymentRequestProposal,StellarPaymentNetwork,DateOnly} from '../client.js';
import type {PaymentReceivablesData,ReceivablesInvoiceRecord} from '../payment-requests.js';
export const COLLECTION_SCHEMA:'stellar-forge.payment-plan-collection.v1';
export interface CollectionOptions {network:StellarPaymentNetwork;now?:string;exceptId?:string|null}
export function collectionAvailability(invoice:ReceivablesInvoiceRecord,data:PaymentReceivablesData,
  options:CollectionOptions&{planId:string;editionId:string}):PaymentPlanCollectionAvailability;
export function compilePlanCollection(invoice:ReceivablesInvoiceRecord,data:PaymentReceivablesData,
  value:PaymentPlanCollectionSelection,options:CollectionOptions):PaymentPlanCollectionSource;
export function planCollectionStatus(proposal:PaymentRequestProposal,invoice:ReceivablesInvoiceRecord,
  data:PaymentReceivablesData,asOf?:DateOnly,observedAt?:string):PaymentPlanCollectionStatus|null;
