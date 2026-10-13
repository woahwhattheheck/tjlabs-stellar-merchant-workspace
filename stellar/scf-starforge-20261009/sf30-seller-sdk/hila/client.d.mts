/** MIT. Complete original HILA HTTP and source-domain contracts. */
export type Sha256 = string;
export type Instant = string;
export type Decision = "accepted" | "needs-correction" | "note";
export type ReviewState = "draft" | "reviewed" | "needs-correction";
export type Json = null | boolean | number | string | Json[] | { [key:string]:Json };
export interface AcquisitionProvenance {label:string;url:string;retrievedAt:Instant;license:string;notice:string}
export interface Acquisition {schema:"stellar-forge.hila-questionnaire-acquisition.v1";id:Sha256;questionnaire:Sha256;provenance:AcquisitionProvenance}
export interface EditionProvenance {kind:"approved-anonymized"|"synthetic-engineering";label:string;sourceUrl:string;obtainedAt:Instant;periodStart:string;periodEnd:string;approvedBy:string;approvedAt:Instant;approval:string}
export interface Questionnaire {schema:"stellar-forge.hila-questionnaire.v1";sha256:Sha256;inventorySha256:Sha256;bytes:number;title:string;root:string;languages:string[];fields:Record<string,Record<string,Json>>;dimensions:Record<Dimension,string[]>;[key:string]:unknown}
export type Dimension = "availability"|"accessibility"|"quality"|"use"|"awareness";
export type Axis = "country"|"sector"|"organization"|"role";
export interface NativeBuild {schema:string;id:Sha256;source:Sha256;plan:Sha256;rowCount:number;keys:string[];columns:Record<string,Json>[];native:Record<string,Json>;engineBlob:string;files:Record<string,{bytes:number;sha256:Sha256}>}
export interface EditionInput {requestId:string;name:string;source:Sha256;questionnaire:Sha256;acquisition:Sha256;mapping:Record<string,string>;respondentKey:string|null;provenance:EditionProvenance}
export interface Edition extends Omit<EditionInput,"requestId"> {schema:"stellar-forge.hila-edition.v1";id:Sha256;normalizer:string;plan:Sha256;build:NativeBuild;sourceBytes:number;rows:number;created:Instant}
export interface ItemRule {field:string;included:boolean;reason:string;weight:string|null;scores:Record<string,string|null>}
export interface Methodology {
 schema:"stellar-forge.hila-rules.v1";semantics:"hila-explicit-weighted-items-equal-respondents-1";questionnaire:Sha256;name:string;status:"draft"|"approved";
 provenance:{label:string;url:string;version:string;approvedBy:string;approvedAt:string;notes:string};
 dimensions:{id:Dimension;minimumAnswered:number|null;items:ItemRule[]}[];
 disclosure:{status:"draft"|"approved";approvedBy:string;approvedAt:string;basis:string;minimumRespondents:number|null;minimumScored:number|null;complementarySuppression:"whole-axis";releaseComparisons:boolean};
}
export interface RowDecision {edition:Sha256;recordId:Sha256;decision:"include"|"exclude"|"note";reviewer:string;note:string}
export interface CellDecision {key:Sha256;decision:Decision;reviewer:string;note:string}
export interface ReviewDefinition {name:string;notes:string;editions:Sha256[];rules:Methodology;selection:Record<Axis,(string|null)[]>;review:{status:ReviewState;reviewer:string;note:string};rowDecisions:RowDecision[];cellDecisions:CellDecision[]}
export type ReviewInput = ReviewDefinition & {requestId:string} & ({id:Sha256;expectedRevision:number}|{id?:never;expectedRevision?:never});
export interface Review extends ReviewDefinition {schema:"stellar-forge.hila-review.v1";id:Sha256;revision:number;definitionSha256:Sha256;created:Instant;updated:Instant;previousRevision:number|null;report:Record<string,Json>}
export interface RetainedRequest {schema:"stellar-forge.hila-request.v1";id:string;kind:"edition.save"|"review.save";inputSha256:Sha256;input:EditionInput|ReviewInput;result:Edition|Review}
export interface CodedRow {recordId:Sha256;sourceRow:string;sourceRowSha256:Sha256;consent:string|null;answers:Record<string,Json>}
export interface RespondentPage {edition:Sha256;rows:CodedRow[];offset:number;total:number;nextOffset:number|null;privacy:string}
export interface HilaConnection {console?:string;url?:string;token?:string}
export interface ClientOptions {fetch?:typeof fetch;timeoutMs?:number}
export interface RevisionOptions {revision?:number;signal?:AbortSignal}
export interface ReportOptions extends RevisionOptions {public?:boolean}
export class HilaHttpError extends Error {status:number;body:unknown;uncertain:boolean}
export class HilaClient {
 constructor(connection:string|HilaConnection,options?:ClientOptions);
 readonly origin:string;
 launch():Promise<Record<string,unknown>>;
 state():Promise<Record<string,unknown>>;
 questionnaire(id:Sha256):Promise<Questionnaire>;
 acquisition(id:Sha256):Promise<Acquisition>;
 addQuestionnaire(original:Blob|ArrayBuffer|ArrayBufferView|string,provenance:AcquisitionProvenance):Promise<{questionnaire:Questionnaire;acquisition:Acquisition}>;
 addSource(original:Blob|ArrayBuffer|ArrayBufferView|string,metadata:{name:string;label:string}):Promise<Record<string,unknown>>;
 source(id:Sha256):Promise<Record<string,unknown>>;
 mapping(questionnaire:Sha256,source:Sha256):Promise<{schema:string;questionnaire:Sha256;source:Sha256;mapping:Record<string,string>;unresolved:{field:string;candidates:string[];reason:string}[];excludedFields:unknown;consent:unknown;automaticSave:false}>;
 rulesTemplate(questionnaire:Sha256):Promise<Methodology>;
 validateRules(questionnaire:Sha256,rules:Methodology):Promise<Methodology>;
 saveEdition(input:EditionInput):Promise<Edition>;
 edition(id:Sha256):Promise<Edition>;
 editions():Promise<Edition[]>;
 rows(edition:Sha256,options?:{offset?:number;limit?:number}):Promise<RespondentPage>;
 query(build:Sha256,query?:Record<string,string>):Promise<Record<string,unknown>>;
 compareNative(before:Sha256,after:Sha256):Promise<Record<string,unknown>>;
 saveReview(input:ReviewInput):Promise<Review>;
 review(id:Sha256,revision?:number):Promise<Review>;
 reviews():Promise<Review[]>;
 history(id:Sha256):Promise<Review[]>;
 request(id:string):Promise<RetainedRequest>;
 report(id:Sha256,options?:ReportOptions):Promise<Record<string,unknown>>;
 receive(original:Blob|ArrayBuffer|ArrayBufferView):Promise<Record<string,unknown>>;
 /** Caller consumes/cancels each complete response body before close resolves. */
 exportReview(id:Sha256,options?:RevisionOptions):Promise<Response>;
 exportReport(id:Sha256,options?:ReportOptions):Promise<Response>;
 offlineHtml(id:Sha256,options?:RevisionOptions):Promise<Response>;
 exportDataset(build:Sha256,options?:{signal?:AbortSignal}):Promise<Response>;
 close():Promise<void>;
}
export function createHilaClient(connection:string|HilaConnection,options?:ClientOptions):HilaClient;
export function downloadHilaFile(response:Response,path:string,options?:{expectedSha256?:Sha256|null;maxBytes?:number}):Promise<{path:string;bytes:number;sha256:Sha256;reused:boolean}>;
