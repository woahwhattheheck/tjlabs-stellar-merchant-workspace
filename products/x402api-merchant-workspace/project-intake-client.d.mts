// MIT. Original intake identity and readonly review use the maintained invoice types.
import type {MerchantOperatorClient} from './operator-client.mjs';
export type JSONValue=null|boolean|number|string|JSONValue[]|{[key:string]:JSONValue};
export type JSONObject={[key:string]:JSONValue};
export interface IntakeOptions {
  /** Actual running managed intake origin, http://127.0.0.1:PORT/. */
  url:string;selectionSha256:string;operatorToken:string;
  timeoutMs?:number;maximumJSONBytes?:number;maximumDownloadBytes?:number;
}
export interface RequestSettings {signal?:AbortSignal}
export interface IntakeConnection {
  readonly schema:'stellar-forge.merchant-intake-connection.v1';
  readonly url:string;readonly selectionSha256:string;readonly operation:string;
  readonly storeId:string;readonly manifestSha256:string;readonly archiveSha256:string;
}
export interface IntakeSelection extends JSONObject {
  schema:'stellar-forge.merchant-project-intake.v1';
  request:JSONObject&{operation:string};
  storeId:string;manifestSha256:string;sourceSha256:string;originalRowsSha256:string;
  originalOperation:string;workspaceDirectory:string;
  archive:JSONObject&{sha256:string};
}
export interface IntakeState {
  schema:'stellar-forge.merchant-project-intake.v1';
  selection: IntakeSelection;
  selectionSha256:string;
  state:'READY'|'RECEIVING'|'RECEIVED'|'COMPLETE'|'RETRY_REQUIRED';
  summary:JSONObject;error:JSONObject|null;reviewUrl:string|null;
  receiptAvailable:boolean;receiving:boolean;
}
export interface InventoryOptions extends RequestSettings {offset?:number;limit?:number;filter?:string}
export interface InventoryPage {
  manifestSha256:string;total:number;offset:number;limit:number;rows:JSONObject[];nextOffset:number|null;
}
export type ReceivedMerchantReview=Readonly<Pick<MerchantOperatorClient,
  'connection'|'readRegister'|'registerPages'|'inspectInvoice'|'paymentEnvelope'|
  'prepareRegisterExport'|'downloadRegisterExport'|'downloadInvoiceResult'|'observationSummary'>>;
export interface MerchantIntakeClient {
  readonly connection:IntakeConnection;
  status(settings?:RequestSettings):Promise<IntakeState>;
  /** Sends once. On uncertain transport, inspect status then resume this same selected operation. */
  receive(settings?:RequestSettings):Promise<IntakeState>;
  inventory(options?:InventoryOptions):Promise<InventoryPage>;
  inventoryPages(options?:Omit<InventoryOptions,'offset'>):AsyncGenerator<InventoryPage,void,unknown>;
  manifest(settings?:RequestSettings):Promise<JSONObject>;
  receipt(settings?:RequestSettings):Promise<JSONObject>;
  review(settings?:RequestSettings):Promise<ReceivedMerchantReview>;
}
export class MerchantIntakeClientError extends Error {
  code:string;status:number|null;outcomeUnknown:boolean;recovery?:JSONObject;
  constructor(code:string,details?:{status?:number|null;outcomeUnknown?:boolean;recovery?:JSONObject|null});
}
export const MERCHANT_INTAKE_CONNECTION_SCHEMA:'stellar-forge.merchant-intake-connection.v1';
export function createMerchantIntakeClient(input:IntakeOptions,settings?:RequestSettings):Promise<MerchantIntakeClient>;
