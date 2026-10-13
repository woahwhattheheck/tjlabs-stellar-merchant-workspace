// MIT. Public Node operator client types; decimal monetary values remain strings.
export type JSONValue = null | boolean | number | string | JSONValue[] | {[key:string]:JSONValue};
export type JSONObject = {[key:string]:JSONValue};
export type InvoiceState = 'CREATED'|'CHARGE_UNCERTAIN'|'CHARGE_REJECTED'|'AWAITING_PAYMENT'|
  'PAYMENT_PENDING'|'PAYMENT_UNCERTAIN'|'PAYMENT_FAILED'|'SETTLEMENT_CONFIRMED'|
  'FULFILLMENT_PENDING'|'FULFILLMENT_INTERRUPTED'|'COMPLETE';
export interface RequestSettings {signal?:AbortSignal}
export interface OperatorOptions {
  /** HTTPS origin, or HTTP loopback origin, with no path/query/credentials. */
  url:string;
  /** Private existing server credential; never included in returned connection metadata. */
  operatorToken:string;
  timeoutMs?:number; maxJSONBytes?:number; maxDownloadBytes?:number;
}
export interface ConnectedOperatorOptions extends OperatorOptions {storeId:string;tenantId:string}
export interface OperatorConnection {
  readonly schema:'stellar-forge.merchant-operator-connection.v1';
  readonly url:string;readonly storeId:string;readonly tenantId:string;
}
export interface InspectedOperator extends OperatorConnection {
  mode:'live'|'review';historyRevision:string;configuration:JSONObject;
}
export interface InvoiceSelection {
  q?:string;state?:InvoiceState|'';from?:string;to?:string;assetId?:string;network?:string;
}
export interface RegisterSource {
  storeId:string;historySequence:string;revision:string;capturedAt:string;mode:'live'|'review';
}
export interface FileIdentity {bytes:number;sha256:string}
export interface SavedDownload extends FileIdentity {path:string;reused:boolean}
export interface RetainedResult extends FileIdentity {fileName?:string;contentType?:string;path?:string}
export interface InvoiceOffer {
  assetId:string;asset:string;network:string;recipient:string;assetVersion:number|string;
  walletVersion:number|string;label:string;decimals:number;amountAtomic:string;
}
export interface RegisteredInvoice {
  id:string;reference:string;title:string;state:InvoiceState;createdAt:string;updatedAt:string;
  tenantId:string;resourceId:string;resourceVersionId:string;resourceVersion:number|string;
  fulfillmentBinding:JSONValue;chargeId:string|null;providerOrderId:string|null;paymentId:string|null;
  offers:InvoiceOffer[];
  receipt:{status:'RECORDED_VERIFIED'|'NOT_RECORDED';verifiedAt?:string;receiptDigest?:string;signingKeyVersion?:number|string};
  delivery:{state:string;paymentId:string|null;recordedComplete:boolean;orderProjectionPending:boolean;
    returned:FileIdentity|null;saved:RetainedResult|null;projectionConsistent:boolean};
  lastError:string|null;
}
export interface InvoiceRegister {
  schema:'stellar-forge.merchant-invoice-register.v1';source:RegisterSource;
  selection:Required<InvoiceSelection>;counts:{selected:number;total:number;states:Partial<Record<InvoiceState,number>>};
  railOptions:{assetId:string;network:string;label:string}[];orders:RegisteredInvoice[];
  page:{offset:number;limit:number;returned:number;previous:string|null;next:string|null};
  config:JSONObject&{tenantId:string};mode:'live'|'review';
}
export interface RegisterOptions extends RequestSettings {
  selection?:InvoiceSelection;limit?:number;cursor?:string|null;revision?:string|null;
}
export interface RegisterExport extends FileIdentity {
  url:string;fileName:string;source:RegisterSource;selection:Required<InvoiceSelection>;
  invoiceCount:number;offerCount:number;expiresInSeconds:number;
}
export interface InvoiceRecord {
  id:string;reference:string;title:string;state:InvoiceState;createdAt:string;updatedAt:string;
  result?:RetainedResult;
  /** Full maintained original record, including its frozen offer and recorded outcomes. */
  [key:string]:unknown;
}
export interface InvoiceInspection {order:InvoiceRecord;history:unknown[]}
export interface InvoiceOutcome {order:InvoiceRecord}
export interface CreateInvoiceInput {
  /** Retain this UUID before the first call and use it for every subsequent inspection. */
  id:string;reference:string;title:string;prices:{assetId:string;amountAtomic:string}[];
}
export interface PaymentEnvelope {
  version:number|string;method:string;url:string;contentType:string;bodyBase64:string;
  paymentRequired:unknown;challengeDigest:string;merchantReference:string;
}
export interface ProjectStatus {
  schema:string;operation:string;storeId:string;state:string;createdAt:string;updatedAt:string;
  archive?:{bytes:string;sha256:string;members:number;fileName:string};
  snapshot?:unknown;source?:unknown;error?:unknown;configuration?:unknown;
}
export type Recovery = {kind:'invoice';id:string;action:'inspect'}|
  {kind:'project';operation:string;action:'status'};
export class MerchantOperatorError extends Error {
  code:string;status:number|null;outcome?:'UNKNOWN'|'RECEIVED';recovery?:Recovery|null;
  constructor(code:string,options?:{status?:number|null;outcome?:'UNKNOWN'|'RECEIVED'|null;recovery?:Recovery|null});
}
export interface MerchantOperatorClient {
  readonly connection:OperatorConnection;
  readRegister(options?:RegisterOptions):Promise<InvoiceRegister>;
  registerPages(options?:Omit<RegisterOptions,'cursor'|'revision'>):AsyncGenerator<InvoiceRegister,void,unknown>;
  inspectInvoice(id:string,settings?:RequestSettings):Promise<InvoiceInspection>;
  createInvoice(input:CreateInvoiceInput,settings?:RequestSettings):Promise<InvoiceOutcome>;
  createCharge(id:string,settings?:RequestSettings):Promise<InvoiceOutcome>;
  paymentEnvelope(id:string,settings?:RequestSettings):Promise<PaymentEnvelope>;
  submitPaymentAuthorization(id:string,paymentSignature:string,settings?:RequestSettings):Promise<InvoiceOutcome>;
  reconcileInvoice(id:string,settings?:RequestSettings):Promise<InvoiceInspection>;
  observation(settings?:RequestSettings):Promise<JSONObject>;
  observationSummary(settings?:RequestSettings&{historySequence?:string|number}):Promise<JSONObject>;
  project(settings?:RequestSettings):Promise<JSONObject>;
  projectStatus(operation:string,settings?:RequestSettings):Promise<ProjectStatus>;
  projectManifest(operation:string,settings?:RequestSettings):Promise<JSONObject>;
  beginProject(operation:string,settings?:RequestSettings):Promise<ProjectStatus>;
  prepareRegisterExport(options:RequestSettings&{
    selection?:InvoiceSelection;revision:string;format?:'json'|'csv';
  }):Promise<RegisterExport>;
  downloadRegisterExport(ticket:RegisterExport,destination:string,settings?:RequestSettings):Promise<SavedDownload>;
  downloadInvoiceResult(id:string,destination:string,settings?:RequestSettings):Promise<SavedDownload>;
  downloadProject(operation:string,destination:string,settings?:RequestSettings):Promise<SavedDownload>;
}
export const MERCHANT_OPERATOR_CONNECTION_SCHEMA:'stellar-forge.merchant-operator-connection.v1';
export function inspectMerchantOperator(input:OperatorOptions,settings?:RequestSettings):Promise<InspectedOperator>;
export function createMerchantOperatorClient(input:ConnectedOperatorOptions,settings?:RequestSettings):Promise<MerchantOperatorClient>;
