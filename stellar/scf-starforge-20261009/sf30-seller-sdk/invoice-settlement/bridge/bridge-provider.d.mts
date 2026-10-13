export type Json = null | boolean | number | string | Json[] | {[key:string]:Json};
export type JsonObject = {[key:string]:Json};
export type Finding = {code:string; [key:string]:Json};
export type ProviderStatus = 'PENDING'|'PROVIDER_DELIVERED'|'EXCEPTION'|'NONPAYMENT_ACTIVITY'|'UNRECOGNIZED_STATE'|'UNRECOGNIZED_ACTIVITY';
export const BRIDGE_CONTRACT_VERSION:'bloccpay.bridge-provider-observations.v1';
export class BridgeContractError extends Error {
  readonly code:string;
  readonly details:Record<string,unknown>;
  constructor(code:string,message:string,details?:Record<string,unknown>);
}
export function exactDecimal(text:string):{text:string;normalized:string;coefficient:bigint;scale:number};
export function compareDecimalText(a:string,b:string):-1|0|1;
export interface TransferObservation {
  schema:typeof BRIDGE_CONTRACT_VERSION;
  kind:'transfer'; id:string; customerId:string|null; clientReferenceId:string|null;
  state:string; status:ProviderStatus; amountCurrency:string|null;
  amounts:Record<string,string>; receiptAmounts:Record<string,string>;
  source:JsonObject|null; destination:JsonObject|null;
  provisionalDestinationTxHash:string|null; finalizedDestinationTxHash:string|null;
  createdAt:string|null; updatedAt:string|null; original:JsonObject;
  findings:Finding[]; ledgerAction:'NONE';
}
export interface ActivityObservation {
  schema:typeof BRIDGE_CONTRACT_VERSION;
  kind:'virtual_account.activity'; id:string; type:string; status:ProviderStatus;
  customerId:string; virtualAccountId:string; depositId:string|null;
  amountCurrency:string|null; amountBasis:'SOURCE'|'DESTINATION';
  amounts:Record<string,string>; subtotalCurrencyBasis:'SOURCE';
  fiatFeesCurrencyBasis:'SOURCE'; gasFeeCurrencyBasis:'DESTINATION';
  provisionalDestinationTxHash:string|null; finalizedDestinationTxHash:string|null;
  createdAt:string|null; original:JsonObject; findings:Finding[]; ledgerAction:'NONE';
}
export interface OriginalEndpointBinding {
  developerId:string;
  customerIds:string[];
  virtualAccounts?:Array<{customerId:string;virtualAccountId:string}>;
  categories?:Array<'transfer'|'virtual_account.activity'>;
}
export interface WebhookObservation {
  schema:typeof BRIDGE_CONTRACT_VERSION; kind:'webhook';
  eventId:string; category:string; eventType:string; objectId:string; developerId:string;
  eventCreatedAt:string; sequence:Json;
  original:JsonObject; observation:TransferObservation|ActivityObservation;
  ledgerAction:'NONE'; acquisition:'VERIFIED_NOT_COMMITTED';
}
export function describeTransfer(input:unknown):TransferObservation;
export function describeVirtualAccountActivity(input:unknown):ActivityObservation;
export function describeWebhookEvent(input:unknown,binding:OriginalEndpointBinding):WebhookObservation;
export interface ListPage {
  original:JsonObject & {data:JsonObject[]};
  terminal:boolean; count:number; firstId:string|null; lastId:string|null;
}
export function inspectListPage(input:unknown,options?:{limit?:number;previousCursor?:string|null}):ListPage;
export interface OriginalReadResponse {
  document:JsonObject;
  /** Original transport response/body/headers identity remains available to its durable owner. */
  [key:string]:unknown;
}
export interface HistoryOptions<Receipt extends object> {
  readPage:(request:{limit:number;starting_after:string|null;signal?:AbortSignal})=>Promise<OriginalReadResponse>;
  retainPage:(entry:{page:number;requestedCursor:string|null;response:OriginalReadResponse;terminal:boolean;nextCursor:string|null;signal?:AbortSignal})=>Promise<Receipt>;
  initialCursor?:string|null;limit?:number;maxPages?:number;signal?:AbortSignal;
  onPage?:(progress:{pages:number;rows:number;terminal:boolean;retained:Receipt})=>void|Promise<void>;
}
export function acquireHistory<Receipt extends object>(options:HistoryOptions<Receipt>):Promise<{
  schema:typeof BRIDGE_CONTRACT_VERSION;status:'COMPLETE_SOURCE';pages:number;rows:number;
  terminalEmptyPage:Receipt;receipts:Receipt[];lastCursor:string|null;
}>;
