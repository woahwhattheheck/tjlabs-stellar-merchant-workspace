export type SourceKind="public-original"|"public-derived"|"approved-private"|"synthetic-engineering";
export interface SourceMetadata {label:string;filename:string;url?:string|null;retrievedAt:string;provenance:SourceKind;notice?:string}
export type FieldSelector={index:number}|{constant:string};
export interface SourceSelection{source:string;format:"csv"|"json"|"xlsx";sheet?:string;headers:string[];fields:Record<string,FieldSelector>;valueMaps?:Record<string,Record<string,string>>}
export interface NamedDecision{reviewer:string;note:string;at:string}
export interface CatalogueDecision extends NamedDecision{source:string;row:number;field:string;original:string;value:string}
export interface Match extends NamedDecision{transaction:string;registration:string}
export interface ExceptionReview extends NamedDecision{key:string}
export interface ReviewDefinition{name:string;notes?:string;currencyDigits:Record<string,number>;selections:Partial<Record<"catalogue"|"registrations"|"transactions"|"confirmations",SourceSelection>>;catalogueDecisions:CatalogueDecision[];matches:Match[];exceptions:ExceptionReview[];cutover:{state:"draft"|"ready"|"released"|"rolled-back";reviewer:string;note:string;at?:string;rollbackRevision?:number};importPlan?:NamedDecision&{provider:"coursestorm-csv";catalogue:string;selectedIds:string[]}}
export interface SaveRequest{requestId:string;id?:string;expectedRevision?:number;actor:string;at:string;definition:ReviewDefinition}
export interface ReviewView{schema:string;id:string;revision:number;requestId:string;requestSha256:string;actor:string;at:string;definition:ReviewDefinition;sources:(SourceMetadata&{id:string;bytes:number})[];derivedSha256:string;derived:{datasets:Record<string,Record<string,unknown>[]>;registrations:Record<string,unknown>[];issues:Record<string,unknown>[];unresolved:number;totals:Record<string,{gross:string;refund:string;paid:string;service_fee:string;student_fee:string;reported_net:string;reported_net_rows:number}>;classCounts:Record<string,number>;matches:Record<string,string>}}
export interface Artifact{filename:string;bytes:number;sha256:string;url:string}
export class ClassIntakeClient{
 constructor(baseUrl:string,options?:{fetch?:typeof fetch});
 state():Promise<{schema:string;workspaceId:string;sources:(SourceMetadata&{id:string;bytes:number})[];reviews:ReviewView[];contract:{fields:Record<string,string[]>;required:Record<string,string[]>}}>;
 view(id:string,revision?:number):Promise<ReviewView>;
 history(id:string):Promise<ReviewView[]>;
 request(requestId:string):Promise<{state:"NOT_RECORDED"|"RECORDED";requestId:string;workspaceId:string;sha256?:string;request?:SaveRequest;result?:Omit<ReviewView,"derived">}>;
 save(request:SaveRequest):Promise<ReviewView>;
 table(selection:{source:string;format:"csv"|"json"|"xlsx";sheet?:string}):Promise<{columns:string[];rows:string[][];rowNumbers?:number[];headerRow?:number}>;
 compare(id:string,before:number,after:number):Promise<{id:string;beforeRevision:number;afterRevision:number;changes:unknown[];allocationChanges:unknown[];decisionChanges:unknown[];beforeTotals:unknown;afterTotals:unknown}>;
 export(id:string,revision?:number,format?:"packet"|"catalogue"):Promise<Artifact>;
 receive(bytes:Uint8Array|Blob):Promise<{selected:ReviewView;history:ReviewView[];packet:{bytes:number;sha256:string}}>;
 addSource(bytes:Uint8Array|Blob,metadata:SourceMetadata):Promise<SourceMetadata&{id:string;bytes:number}>;
 download(descriptor:Artifact):Promise<Uint8Array>;
}
