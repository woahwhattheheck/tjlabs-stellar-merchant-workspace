export interface CommercialScope {readonly workspaceId:string;readonly caseId:string}
export interface SelectedCase {expectedRevision:string;scope?:CommercialScope;id?:string}
export interface PerformanceFileInput extends SelectedCase {
  sourceText:string;sourceSha256:string;quoteId:string;quoteSha256:string;tariffSourceId?:string
}
export interface ReceivePerformanceInput extends PerformanceFileInput {requestId:string;actor:string;reviewSha256:string}
export interface PreparePerformanceRevisionInput extends SelectedCase {
  sourceId:string;quoteId:string;quoteSha256:string;proposedMonthlyRequests:string;targetTariffSourceId?:string
}
export interface PerformanceDownloadInput {
  sourceId:string;kind:'SOURCE'|'ATTACHMENT'|'REPORT';revision?:string;expectedRevision?:string;scope?:CommercialScope;id?:string
}
export interface FileDescriptor {filename:string;bytes:number;sha256:string;mediaType:string}
export interface PerformanceSourceSummary {
  id:string;title:string;label:string;savedAt:string;nativeSourceId:string;performanceId:string;performanceSha256:string;
  tariffSourceId:string;pricingSourceId:string;measuredQuote:{id:string;sha256:string;title:string};
  file:{name:string;bytes:number;sha256:string};material?:{id:string;sha256:string;[key:string]:unknown};
  review:Record<string,unknown>
}
export interface PerformancePreview {
  scope:CommercialScope;revision:string;source:PerformanceSourceSummary;reviewSha256:string
}
export interface PerformanceReceipt {
  state:'COMPLETE';requestId:string;replayed:boolean;performanceSourceId:string;
  document:{id:string;kind:'PERFORMANCE';sha256:string};case:{id:string;revision:string;workspaceSha256:string;supportSha256:string|null};
  view:Record<string,unknown>&{scope:CommercialScope;performanceSources:PerformanceSourceSummary[]}
}
export interface PerformanceRevision {
  scope:CommercialScope;revision:string;draft:Record<string,unknown>&{parentId:string;performanceSourceId:string};
  source:PerformanceSourceSummary;parent:{id:string;sha256:string;title:string};
  proposal:{routeId:string;monthlyRequests:string;tariffSourceId:string;pricingSourceId:string;rateChanged:boolean}
}
export interface PerformanceDownload {scope:CommercialScope;descriptor:FileDescriptor;bytes:Uint8Array}
export class CommercialPerformanceError extends Error {
  code:string;status?:number;requestState?:string;
  constructor(message:string,details?:{code?:string;status?:number;requestState?:string})
}
export interface CommercialPerformanceClient {
  readonly scope:CommercialScope;
  preview(args:PerformanceFileInput):Promise<PerformancePreview>;
  receive(args:ReceivePerformanceInput):Promise<PerformanceReceipt>;
  prepareRevision(args:PreparePerformanceRevisionInput):Promise<PerformanceRevision>;
  download(args:PerformanceDownloadInput):Promise<PerformanceDownload>;
  call(action:'preview',args:PerformanceFileInput):Promise<PerformancePreview>;
  call(action:'receive',args:ReceivePerformanceInput):Promise<PerformanceReceipt>;
  call(action:'revision',args:PreparePerformanceRevisionInput):Promise<PerformanceRevision>;
  call(action:'download',args:PerformanceDownloadInput):Promise<PerformanceDownload>
}
export function createCommercialPerformanceClient(options:{
  url:string;caseId:string;workspaceId:string;fetch?:typeof globalThis.fetch
}):CommercialPerformanceClient;
