import type {DocumentProviderId,DocumentSetup,DocumentInstallation} from './index.mjs';
import type {openDocumentService} from './launch.mjs';
import type {openDocumentBatchCustomer} from './batch.mjs';
export const DOCUMENT_COMMISSIONING_SCHEMA:'stellar-forge.document-commerce-commissioning.v1';
export const DOCUMENT_COMMISSIONING_REVIEW_SCHEMA:'stellar-forge.document-commerce-review.v1';
export interface DocumentCommissioningOptions{
  commerceDirectory:string;directory:string;intentId:string;provider?:DocumentProviderId;anonymous?:boolean;
  customerOptionsFile?:string|null;customerDirectory?:string|null;
  sellerPort?:number;customerPort?:number;operatorPort?:number;operationsPort?:number;
}
export interface CommissioningFile{path:string;bytes:number;sha256:string}
export interface OriginalDocumentCommerce{
  commerceDirectory:string;operatorWorkspace:string;intentId:string;routeId:string;acceptIndex:number;
  originalTerms:DocumentSetup['payment'];publicOrigin:string;payer:string;
  sharedBudget:{maxSingleAtomic:string;totalAtomic:string;dailyAtomic:string;selectedTotalAtomic:string;allSelectionsFitTotal:boolean};
  facilitator:CommissioningFile;
}
export interface DocumentCommissioningReview{
  schema:typeof DOCUMENT_COMMISSIONING_REVIEW_SCHEMA;selectionSha256:string;
  options:Required<DocumentCommissioningOptions>;original:OriginalDocumentCommerce;
  configurationFiles:CommissioningFile[];sourceFiles:CommissioningFile[];request:DocumentSetup;
  customer:Parameters<typeof openDocumentBatchCustomer>[0];
  paths:{merchant:string;factory:string;customerOptions:string;consumerOptions:string;compositionOptions:string;sourceRoot:string};
  environmentNames:string[];
}
export interface DocumentCommissioning{
  schema:typeof DOCUMENT_COMMISSIONING_SCHEMA;directory:string;selectionSha256:string;
  original:OriginalDocumentCommerce;installation:DocumentInstallation;customerOptions:string;
  consumerOptions:string;compositionOptions:string;sourceRoot:string;nativeFactory:string;nativeFactoryFile:CommissioningFile;environmentNames:string[];
  serviceOptions:Parameters<typeof openDocumentService>[0];
  routes:{origin:string;seller:string[];customerPrefix:'/jobs/';privateListeners:string[]};budgetMeaning:string;
}
export function reviewDocumentCommissioning(options:DocumentCommissioningOptions):Promise<DocumentCommissioningReview>;
export function prepareDocumentCommissioning(options:DocumentCommissioningOptions,control?:{expectedSelection?:string}):Promise<DocumentCommissioning>;
export function inspectDocumentCommissioning(directory:string):Promise<DocumentCommissioning>;
export function openCommissionedDocumentService(options:{directory:string;expectedSelection?:string},control?:{
  environment?:Record<string,string|undefined>;signal?:AbortSignal;
}):Promise<{
  commissioning:DocumentCommissioning;service:Awaited<ReturnType<typeof openDocumentService>>;
  launch:Awaited<ReturnType<typeof openDocumentService>>['launch'];
  closed:Promise<{state:'STOPPED';selectionSha256:string}>;
  close():Promise<{state:'STOPPED';selectionSha256:string}>;
}>;
