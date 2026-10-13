/** Complete worksheet files and paged review over an existing accounting platform client. */
export type QboWorksheetRead = 'export'|'open'|'inspect'|'plan-preview';
export type QboWorksheetMode = 'export'|'open'|'inspect'|'plan-input';
export type QboWorksheetFileName = 'worksheet.json'|'allocations.csv'|'account-reference.csv'|
  'worksheet-review.json'|'plan-input.json'|'journal-preview.json';
export interface QboWorksheetInputAliases {
  source:string;sourceSha256?:string;returnedSource?:string;returnedSourceSha256?:string;
  companySource?:string;companySourceSha256?:string;
}
export interface QboWorksheetFileSelectors {
  kind:'qbo-worksheet';worksheetAction:QboWorksheetMode;
  worksheetSource:string;worksheetSourceSha256:string;
  worksheetReturnedSource?:string;worksheetReturnedSourceSha256?:string;
  worksheetCompanySource?:string;worksheetCompanySourceSha256?:string;
  worksheetResultSha256:string;file:QboWorksheetFileName;
}
export interface QboWorksheetFileDescriptor {
  name:QboWorksheetFileName;contentType:string;bytes:number;sha256:string;
  selection:QboWorksheetFileSelectors;
}
export interface QboWorksheetInventory extends QboWorksheetInputAliases {
  schema:'stellar-forge.accounting-qbo-worksheet-client.v1';workspace:string;
  action:QboWorksheetMode;resultSha256:string;sourceSha256:string;
  files:QboWorksheetFileDescriptor[];
}
export interface QboWorksheetPage<T=unknown> extends QboWorksheetInventory {
  page:{view:string;total:number;offset:number;limit:number;items:T[]};
}
export interface QboWorksheetCallOptions {
  requestSignal?:AbortSignal;
  timeoutMs?:number;
}
export interface QboWorksheetClientReader {
  readonly platform:string;readonly workspace:string;
  read(action:string,args?:Record<string,unknown>,options?:QboWorksheetCallOptions):Promise<unknown>;
}
export interface QboWorksheetPagingOptions extends QboWorksheetCallOptions {
  view?:'rows'|'accounts'|'conflicts'|'changes'|'source-issues'|'draft-issues'|'resolutions'|'excluded'|'lines';
  pageSize?:number;expectedResultSha256?:string;
}
export interface QboWorksheetSelectedFile {
  selection:QboWorksheetFileSelectors;expectedSha256:string;name:QboWorksheetFileName;
  bytes:number;contentType:string;workspace:string;resultSha256:string;
}
export function qboWorksheetFileSelection(inventory:QboWorksheetInventory,name:QboWorksheetFileName):QboWorksheetSelectedFile;
export function qboWorksheetPages<T=unknown>(client:QboWorksheetClientReader,action:QboWorksheetRead,
  args:QboWorksheetInputAliases,options?:QboWorksheetPagingOptions):AsyncGenerator<QboWorksheetPage<T>,void,unknown>;
