/** MIT. Original humanitarian source, mapping, review and HTTP contracts. */
export type Sha256 = string;
/** Letter-prefixed stable identifier, at most 80 characters. */
export type ReviewId = string;
export type Json = null | boolean | number | string | Json[] | {[key:string]:Json};
export type Selector = {index:number;constant?:never} | {constant:Json;index?:never};
export interface Provenance {
  publisher:string;title:string;url:string;edition:string;retrievedAt:string;license:string|null;
}
export interface ReferenceLevel {
  level:number;code:Selector;name:Selector;aliases:Selector[];geometry?:Selector;
}
export interface ReferenceInput {
  requestId:string;name:string;source:Sha256;table:string;headerRow:number;
  hxlRow:number|null;expectedHeaders:string[];levels:ReferenceLevel[];provenance:Provenance;
}
export interface Reference {
  schema:string;id:Sha256;definition:Omit<ReferenceInput,"requestId">;
  source:Sha256;physicalRows:number;counts:Record<string,Json>;nodes:Record<string,Json>[];
}
export interface TableColumn {
  name:string;index:number;label:string;type:"string"|"integer"|"number"|"boolean"|"decimal";nullable:boolean;trim:boolean;hxl:string|null;unit:string;
}
export interface TablePlan {
  schema:"stellar-forge.humanitarian-table-plan.v1";name:string;table:string;headerRow:number;hxlRow:number|null;
  expectedHeaders:string[];columns:TableColumn[];
  filters?:Json[];ranges?:Json[];sorts?:Json[];maxRows?:number;maxBytes?:number;
  maxCellChars?:number;defaultLimit?:number;maxLimit?:number;allowEmpty?:boolean;
}
/** Complete native Dataset plan returned inside a saved mapping. */
export interface SavedTablePlan extends Omit<TablePlan,'columns'> {
  columns:{name:string;path:Json[];type:string;nullable:boolean;trim:boolean;[key:string]:Json}[];
  selectors:{name:string;index:number;label:string;type:TableColumn['type'];hxl:string;unit:string}[];
  keys:string[];
}
export interface AdministrativeSelection {
  level:number;codeField:string|null;nameField:string|null;scopeCodeField:string|null;
}
export interface OutputMeasure {
  name:string;op:"sum"|"count"|"count-distinct"|"min"|"max";field:string|null;label:string;hxl?:string|null;
}
export interface OutputDefinition {
  id:string;title:string;groupBy?:string[];measures?:OutputMeasure[];
  columns:{field:string;label:string;hxl?:string|null}[];
  where?:{field:string;equals:null|boolean|number|string}[];
}
export interface MappingInput {
  requestId:string;name:string;reference:Sha256;plan:TablePlan;
  admin:AdministrativeSelection;keyFields:string[];outputs:OutputDefinition[];
}
export interface Mapping {
  schema:string;id:Sha256;name:string;reference:Sha256;plan:Sha256;
  definition:Omit<MappingInput,"requestId"|"plan">&{plan:SavedTablePlan};admin:AdministrativeSelection;keyFields:string[];
  outputs:OutputDefinition[];fields:{name:string;type:string;label:string;hxl:string|null;unit:string}[];
}
export interface AliasInput {
  requestId:string;reference:Sha256;level:number;match:"name"|"code";value:string;
  scopeCode:string|null;code:string;reviewer:string;reason:string;
}
export interface Alias extends Omit<AliasInput,"requestId"> {schema:string;id:Sha256}
export type RowPolicy = "require-complete" | "valid-rows";
export interface EditionSelection {source:Sha256;mapping:Sha256;label:string;period:string}
export interface ReviewInput {
  requestId:string;id:ReviewId;name:string;expectedRevision:number;
  editions:EditionSelection[];aliases:Sha256[];reviewer:string;notes:string;rowPolicy:RowPolicy;
}
export interface Review {
  schema:string;id:ReviewId;name:string;revision:number;status:"ready"|"partial"|"needs-review";
  reference:Sha256;editions:(EditionSelection&{id:number;build:Sha256;counts:Coverage;duplicateKeys:number})[];
  aliases:Sha256[];reviewer:string;notes:string;rowPolicy:RowPolicy;
  counts:Record<string,Json>;report:Sha256;requestId:string;definition:Omit<ReviewInput,'requestId'|'expectedRevision'>&{reference:Sha256};
}
export interface Coverage {
  includedRows:number;excludedRows:number;totalRows:number;complete:boolean;rowPolicy:RowPolicy;
}
export interface Report {
  schema:string;id:Sha256;review:ReviewId;revision:number;status:Review["status"];
  counts:Record<string,Json>;editions:Record<string,Json>[];
  outputs:{edition:number;output:string;title:string;rows:number;matchedRows:number;
    columns:{field:string;label:string;hxl:string;type:string}[];coverage:Coverage;definition:OutputDefinition;logicalSha256:Sha256}[];
  comparison:{counts:Record<string,Json>;[key:string]:Json};
  issues:Record<string,number>;reference:Json;
}
export interface RowIssue {code:string;message:string;[key:string]:Json}
export interface NormalizedRow {
  source_row:number|string;values:Record<string,Json>;resolution:Json;issues:RowIssue[];key:Json;
}
export interface RowPage {
  schema:string;review:ReviewId;revision:number;edition:number;offset:number;limit:number;total:number;rows:NormalizedRow[];
}
export interface OutputPage {
  schema:string;review:ReviewId;revision:number;edition:number;output:string;offset:number;limit:number;total:number;
  columns:{field:string;label:string;hxl:string;type:string}[];coverage:Coverage;
  rows:{ordinal:number;values:Json[]}[];
}
export interface ComparisonPage {
  schema:string;review:ReviewId;revision:number;offset:number;limit:number;total:number;comparison:Report['comparison'];
  rows:{ordinal:number;kind:string;key:Json;beforeRow:number|null;afterRow:number|null;
    before:Record<string,Json>|null;after:Record<string,Json>|null;
    changes:{field:string;before:Json;after:Json;beforePresent:boolean;afterPresent:boolean;beforeType?:string|null;afterType?:string|null}[]}[];
}
export interface RetainedRequest {
  id:string;kind:"reference"|"mapping"|"alias"|"review";state:"completed";
  inputSha256:Sha256;input:ReferenceInput|MappingInput|AliasInput|ReviewInput;
  result:Reference|Mapping|Alias|Review;
}
export interface State {
  schema:string;sources:{id:Sha256;label:string;name:string;bytes:number;created:string}[];
  references:{id:Sha256;name:string;source:Sha256;counts:Record<string,Json>;provenance:Provenance}[];
  mappings:{id:Sha256;name:string;reference:Sha256;plan:Sha256;outputs:OutputDefinition[]}[];
  aliases:Alias[];
  reviews:{id:ReviewId;name:string;revision:number;status:Review["status"];reference:Sha256;
    editionCount:number;counts:Record<string,Json>;reviewer:string;notes:string}[];
}
export interface ReceiveResult {
  schema:string;review:Review;receivedRevisions:number[];alreadyPresent:boolean;requestCount:number;
}
export interface ExportDescriptor {path:string;bytes:number;sha256:Sha256;review:ReviewId;revision:number;report:Sha256}
export interface HumanitarianConnection {console?:string;url?:string;token?:string}
export interface ClientOptions {fetch?:typeof fetch;timeoutMs?:number}
export interface RevisionOptions {revision?:number;signal?:AbortSignal}
export class HumanitarianHttpError extends Error {status:number;body:unknown;uncertain:boolean}
export class HumanitarianClient {
  constructor(connection:string|HumanitarianConnection,options?:ClientOptions);
  readonly origin:string;
  launch():Promise<Record<string,unknown>>;
  state():Promise<State>;
  addSource(original:Blob|ArrayBuffer|ArrayBufferView|string,metadata:{name:string;label:string}):Promise<Record<string,unknown>>;
  source(id:Sha256):Promise<Record<string,unknown>>;
  sourceTable(source:Sha256,options?:{table?:string;offset?:number;limit?:number}):Promise<{schema:string;source:Sha256;table:string;offset:number;limit:number;rows:{row:number;cells:string[]}[]}>;
  saveReference(input:ReferenceInput):Promise<Reference>;
  reference(id:Sha256):Promise<Reference>;
  saveMapping(input:MappingInput):Promise<Mapping>;
  mapping(id:Sha256):Promise<Mapping>;
  saveAlias(input:AliasInput):Promise<Alias>;
  alias(id:Sha256):Promise<Alias>;
  saveReview(input:ReviewInput):Promise<Review>;
  review(id:ReviewId,revision?:number):Promise<Review>;
  reviews():Promise<{schema:string;reviews:Review[]}>;
  history(id:ReviewId):Promise<{id:ReviewId;revisions:Review[]}>;
  request(id:string):Promise<RetainedRequest>;
  report(id:ReviewId,options?:RevisionOptions):Promise<Report>;
  rows(id:ReviewId,options?:{revision?:number;edition?:number;offset?:number;limit?:number;issues?:boolean}):Promise<RowPage>;
  outputRows(id:ReviewId,options:{revision?:number;edition?:number;output:string;offset?:number;limit?:number}):Promise<OutputPage>;
  comparisonRows(id:ReviewId,options?:{revision?:number;offset?:number;limit?:number}):Promise<ComparisonPage>;
  receive(original:Blob|ArrayBuffer|ArrayBufferView):Promise<ReceiveResult>;
  /** Consume or cancel every returned response body before close resolves. */
  exportReview(id:ReviewId,options?:RevisionOptions):Promise<Response>;
  exportReport(id:ReviewId,options?:RevisionOptions):Promise<Response>;
  queryNative(build:Sha256,query?:Record<string,string>):Promise<Record<string,unknown>>;
  exportDataset(build:Sha256,options?:{signal?:AbortSignal}):Promise<Response>;
  close():Promise<void>;
}
export function createHumanitarianClient(connection:string|HumanitarianConnection,options?:ClientOptions):HumanitarianClient;
export function downloadHumanitarianFile(response:Response,path:string,options?:{expectedSha256?:Sha256|null;maxBytes?:number}):Promise<{path:string;bytes:number;sha256:Sha256;reused:boolean}>;
