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
  {kind:'project';operation:string;action:'status'}|
  {kind:'intake';operation:string;action:'status'}|{kind:'intake-source';action:'inspect'};
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
  intakeContext(settings?:RequestSettings):Promise<IntakeContext>;
  listIntakes(settings?:RequestSettings):Promise<{context:IntakeContext;intakes:Pick<IntakeStatus,'operation'|'createdAt'|'source'|'counts'|'state'|'planSha256'>[]}>;
  inspectIntakeSource(source:IntakeSource,settings?:RequestSettings):Promise<{columns:string[];rowCount:number;bytes:number;sha256:string}>;
  prepareIntake(input:IntakeInput,settings?:RequestSettings):Promise<IntakeStatus>;
  readIntake(operation:string,settings?:RequestSettings):Promise<IntakeStatus>;
  exportIntake(operation:string,settings?:RequestSettings):Promise<IntakeDelivery>;
  runIntake(operation:string,planSha256:string,settings?:RequestSettings):Promise<IntakeStatus>;
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
  previewInvoiceDelivery(id:string,settings?:RequestSettings):Promise<InvoiceDeliveryReview>;
  prepareInvoiceDelivery(id:string,revision:string,settings?:RequestSettings):Promise<InvoiceDeliveryTicket>;
  downloadInvoiceDelivery(ticket:InvoiceDeliveryTicket,destination:string,settings?:RequestSettings):Promise<SavedDownload>;
  downloadInvoiceResult(id:string,destination:string,settings?:RequestSettings):Promise<SavedDownload>;
  downloadProject(operation:string,destination:string,settings?:RequestSettings):Promise<SavedDownload>;
}
export const MERCHANT_OPERATOR_CONNECTION_SCHEMA:'stellar-forge.merchant-operator-connection.v1';
export function inspectMerchantOperator(input:OperatorOptions,settings?:RequestSettings):Promise<InspectedOperator>;
export function createMerchantOperatorClient(input:ConnectedOperatorOptions,settings?:RequestSettings):Promise<MerchantOperatorClient>;

export interface IntakeSource {name:string;format:'csv'|'json';text:string}
export interface IntakeMapping {
  key:string;reference:string;title:string;assetId:string;amount:string;
  invoiceId?:string;amountMode:'atomic'|'decimal';
}
export interface IntakeContext {
  schema:'stellar-forge.merchant-intake-context.v1';storeId:string;tenantId:string;
  configuration:JSONObject;configurationSha256:string;mode:'live'|'review';
  maximumInvoices:number;maximumSourceRows:number;maximumSourceBytes:number;
}
export interface IntakeInput {
  operation:string;storeId:string;tenantId:string;configurationSha256:string;
  source:IntakeSource;mapping:IntakeMapping;
}
export interface IntakeInvoice {
  key:string;id:string;reference:string;title:string;prices:{assetId:string;amountAtomic:string}[];
  sourceRows:number[];offers:InvoiceOffer[];state:'RETAINED'|'CONFLICT'|'PENDING';
  invoiceState:InvoiceState|null;createdAt:string|null;
}
export interface IntakeStatus {
  schema:'stellar-forge.merchant-intake-status.v1';operation:string;storeId:string;tenantId:string;
  planSha256:string;createdAt:string;source:Omit<IntakeSource,'text'>&FileIdentity;mapping:IntakeMapping;
  configuration:JSONObject;configurationSha256:string;configurationCurrent:boolean;
  state:'PREPARED'|'PARTIAL'|'COMPLETE'|'CONFLICT';
  counts:{invoices:number;offers:number;retained:number;pending:number;conflicts:number};
  invoices:IntakeInvoice[];interruption?:{code:string;invoiceId:string};
}
export interface IntakeDelivery {
  schema:'stellar-forge.merchant-intake-delivery.v1';
  plan:{schema:'stellar-forge.merchant-invoice-intake.v1';operation:string;storeId:string;tenantId:string;
    source:IntakeSource&FileIdentity;mapping:IntakeMapping;configuration:JSONObject;configurationSha256:string;
    planSha256:string;createdAt:string;invoices:Pick<IntakeInvoice,'key'|'id'|'reference'|'title'|'prices'|'sourceRows'>[]};
  status:IntakeStatus;
}

export interface InvoiceDeliveryReview {
 schema:'stellar-forge.merchant-invoice-delivery.v1';owner:{storeId:string;tenantId:string};
 invoiceId:string;revision:string;reference:string;title:string;state:InvoiceState;updatedAt:string;
 offers:(InvoiceOffer&{amount:string})[];hasWalletRequest:boolean;historyRecords:number;members:string[];
 result:(RetainedResult&{member:string})|null;
}
export interface InvoiceDeliveryTicket extends FileIdentity {
 url:string;fileName:string;source:{storeId:string;tenantId:string;revision:string};
 selection:{invoiceId:string;revision:string};invoiceCount:1;offerCount:number;expiresInSeconds:number;
}
