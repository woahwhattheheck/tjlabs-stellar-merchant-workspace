export type GeoapifyJobStatus='PREPARED'|'SENDING'|'UNCERTAIN'|'PENDING'|'POLLING'|'COMPLETE'|'PARTIAL'|'REJECTED'|'EXPIRED'|'ABANDONED';
export interface RetainedFile {file:string;bytes:number;sha256:string}
export interface GeoapifyMapping {text?:string;name?:string;housenumber?:string;street?:string;postcode?:string;city?:string;state?:string;country?:string;identity?:string;latitude?:string;longitude?:string}
export interface GeoapifyBatchOptions {limit?:number;lang?:string;filter?:string;bias?:string;type?:'country'|'state'|'city'|'postcode'|'street'|'amenity'|'locality';priority?:number;endpoint?:'https://api.geoapify.com/v1/batch'|'https://api-eu.geoapify.com/v1/batch'}
export interface GeoapifyJob {id:string;intakeSha256:string;status:GeoapifyJobStatus;queryCount:number;request:RetainedFile;providerBodySha256:string;providerBodyBytes:number;jobId:string|null;events:unknown[];nextPollAt:string|null}
export interface GeoapifyState {schema:'stellar-forge.geoapify-workspace.v1';id:string;directory:string;revision:number;sourceCount:number;intake:RetainedFile|null;jobs:GeoapifyJob[];editions:unknown[];activeEditionId:string|null;exports:unknown[];editor:Record<string,unknown>|null;api:{configured:boolean;maximumBatch:1000;minimumPollMs:60000;retentionHours:24};[key:string]:unknown}
export interface GeoapifyOperator {
 state():Promise<GeoapifyState>;
 act(action:string,payload?:Record<string,unknown>):Promise<{result:unknown;state:GeoapifyState}>;
 readExport(exportId:string,filename:string):Promise<{path:string;bytes:number;sha256:string;contentType:string}>;
 readPublisherExport(kind:string,id:string):Promise<{bytes:Uint8Array;filename:string;contentType:string}>;
 close():Promise<void>;
}
export interface GeoapifyOperatorOptions {directory:string;apiKey?:string;timeoutMs?:number;fetcher?:typeof fetch;workspace?:Omit<GeoapifyOperator,'readPublisherExport'>;publisher?:unknown;facilitators?:unknown}
export const GEOAPIFY_ACTIONS:Set<string>;
export function openGeoapifyOperator(options:GeoapifyOperatorOptions):Promise<GeoapifyOperator>;
export function startGeoapifyWorkspace(options:GeoapifyOperatorOptions & {port?:number;operator?:GeoapifyOperator}):Promise<{origin:string;url:string;token:string;workspace:GeoapifyOperator;close():Promise<void>}>;

export interface GeoapifySourceEntry {intake:RetainedFile & {original:RetainedFile};source:Record<string,unknown>;createdAt:string;activatedAt:string|null;baselineEditionId:string|null;comparison?:RetainedFile;summary:Record<string,number>;active:boolean}
export interface GeoapifySourceStage {format:'csv'|'json';name:string;provenance:string;baselineEditionId:string;sourceURL?:string|null;mapping?:GeoapifyMapping;text?:string;base64?:string;path?:string;expectedSourceSha256?:string;expectedMappingSha256?:string;expectedRevision:number}
export interface GeoapifySourceSelection {sourceSha256:string;expectedComparisonSha256?:string;reuseQueryIds?:string[];reuseAllEligible?:boolean;reviewer?:string;note?:string;expectedRevision:number}
export interface GeoapifySourceComparisonQuery {sourceSha256:string;offset?:number;limit?:number;status?:string;search?:string;reuseOffset?:number;reuseLimit?:number}
export interface GeoapifyIntakeGuard {expectedRevision:number;expectedIntakeSha256?:string}

export interface GeoapifyCustomerIssueInput {requestId:string;editionId:string;title:string;recipient:string;expectedRevision:number}
export interface GeoapifyCustomerReviewPage {offset?:number;limit?:number}
export interface GeoapifyCustomerReviewResolution {queryId:string;choice:'customer'|'current'|'skip';expectedCurrentSha256:string}
export type GeoapifyCustomerAdoptInput={requestId:string;returnId:string;expectedPreviewSha256:string;expectedIntakeSha256:string;reviewer:string;note:string;expectedRevision:number}&({resolutions:GeoapifyCustomerReviewResolution[];readyAll?:never}|{readyAll:true;resolutions?:never});
export interface GeoapifyCustomerReceiveInput {text?:string;path?:string;expectedRevision:number}
export interface GeoapifyCustomerIssue {id:string;requestId:string;createdAt:string;title:string;recipient:string;editionId:string;intakeSha256:string;projectSha256:string;request:RetainedFile;project:RetainedFile;working:RetainedFile;html:RetainedFile}
export interface GeoapifyCustomerReturn {id:string;issueId:string;returnedAt:string;receivedAt:string;reviewer:string;note:string;projectSha256:string;returnSha256:string;choiceCount:number;draftRevision:number;file:RetainedFile;html?:RetainedFile}
export type GeoapifyCustomerPreviewStatus='NO_CUSTOMER_CHOICE'|'SOURCE_CHANGED'|'RESPONSE_CHANGED'|'ALREADY_CURRENT'|'READY'|'CONFLICT';

/** Original UTF-8 bytes: choose exactly one transport for a fresh inspection/import. */
export type GeoapifyOriginalSource={text:string;base64?:never;path?:never}|{base64:string;text?:never;path?:never}|{path:string;text?:never;base64?:never};
export interface GeoapifyInspectionPage {offset:number;limit:number;total:number;returned:number;nextOffset:number|null}
export interface GeoapifySourceField {path:string;types:Record<string,number>;present:number;missing:number;blank:number;pathSupported:boolean;addressSelectable:boolean;identitySelectable:boolean;examples:Array<{value:string|number|boolean|null;truncated:boolean;originalChars?:number}>;collisions:Array<{segments:string[];rows:number;shadowedRows:number;inaccessibleRows:number}>}
export interface GeoapifySourcePreviewOptions {format?:'csv'|'json';name?:string;mapping?:GeoapifyMapping;fieldOffset?:number;fieldLimit?:number;fieldSearch?:string;rowOffset?:number;rowLimit?:number;expectedSourceSha256?:string}
export type GeoapifySourcePreviewInput=GeoapifySourcePreviewOptions&(GeoapifyOriginalSource|{inspectionId:string;text?:never;base64?:never;path?:never});
export interface GeoapifySourcePreview {
 schema:'stellar-forge.geoapify-source-inspection.v1';inspectionId:string;source:{name:string;format:'csv'|'json';bytes:number;sha256:string};rowCount:number;
 fields:GeoapifySourceField[];fieldsPage:GeoapifyInspectionPage&{search:string;unfilteredTotal:number};
 rows:Array<{ordinal:number;source:Record<string,unknown>;queryId?:string|null;identity?:string|null;problems?:string[];params?:Record<string,string>|null;identityOccurrences?:number}>;
 rowsPage:GeoapifyInspectionPage;
 mapped?:{valid:boolean;errors:Array<{code:string;message:string}>;mapping?:GeoapifyMapping;mappingSha256?:string;queryCount?:number;invalidRows?:number;problemRows?:number;duplicateIdentities?:number;duplicateIdentityRows?:number;missingIdentities?:number|null;coordinateCoverage?:{mapped:boolean;valid:number;missing:number;invalid:number};missingPaths?:Array<{key:string;path:string}>};
}
export interface GeoapifySourceImport extends GeoapifySourcePreviewOptions {format:'csv'|'json';provenance:string;mapping:GeoapifyMapping;expectedRevision:number;expectedMappingSha256?:string;text?:string;base64?:string;path?:string}
export interface GeoapifyOperator {
 act(action:'intake.preview',payload:GeoapifySourcePreviewInput):Promise<{result:GeoapifySourcePreview;state:GeoapifyState}>;
}
