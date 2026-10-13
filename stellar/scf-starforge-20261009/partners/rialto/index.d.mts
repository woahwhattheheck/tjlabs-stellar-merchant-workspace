// MIT. Public pure source contracts for complete Rialto receiving.
export type Json = null | boolean | number | string | Json[] | {[key:string]:Json};
export type Original = {[key:string]:Json};
export interface Plan {schema:string;upstream:{repository:string;commit:string};discovery:string;facilitator:string;network:'stellar:testnet'|'stellar:pubnet';scheme:'exact';limit:number;type?:'http'|'mcp';payTo?:string}
export interface HttpRecord {url:string;method:string;status:number|null;retrievedAt:string;bodyUtf8:string|null;[key:string]:unknown}
export interface Resource {index:number;page:number;pageRow:number;key:string;original:Original}
export interface Catalogue {schema:string;plan:Plan;rows:Resource[];pageCount:number;sourceTotals:number[];enumerationComplete:boolean;nextOffset:number;findings:Original[];coverage:string;firstObservedAt:string|null;lastObservedAt:string|null;[key:string]:unknown}
export interface SelectionInput {rowIndex:number;acceptIndex:number;url:string;method:'GET'|'HEAD'|'POST'|'PUT'|'PATCH'|'DELETE';intentId:string;maxAtomic?:string;pathValues?:Record<string,string>;task?:string;usefulOutput?:string}
export interface SelectedRequest extends SelectionInput {schema:string;kind:'selected-customer-request';catalogueSha256:string;page:number;pageRow:number;resourceKey:string;originalListing:Original;selectedTerms:Original;pathBinding:PathBinding;maxAtomic:string;task:string;usefulOutput:string;facilitator:string;network:string}
export const SCHEMA:string;
export const UPSTREAM:{repository:string;commit:string};
export const DEFAULTS:{discovery:string;facilitator:string;network:string;scheme:string;limit:number};
export function need(ok:unknown,message:string):asserts ok;
export function object(value:unknown):value is Original;
export function integer(value:number,name:string,min?:number,max?:number):number;
export function https(value:string):URL;
export function canonical(value:unknown):string|undefined;
export function resourceKey(row:Original):string;
export function parseBody(record:HttpRecord):unknown;
export function plan(input:Record<string,unknown>):Plan;
export function pageUrl(plan:Plan,offset:number):string;
export function page(record:HttpRecord,plan:Plan,offset:number):{items:Original[];total:number;nextOffset:number;terminal:boolean};
export function catalogue(plan:Plan,records:HttpRecord[]):Catalogue;
export function compare(before:Catalogue,after:Catalogue):Original;
export interface PathBinding {routeTemplate:string|null;values:Record<string,string>;advertisedUrl:string;requestUrl:string}
export interface PathDeclaration {routeTemplate:string|null;advertisedKeys:string[];requiredKeys:string[];fixedValues:Record<string,string>;parameters:Array<{name:string;required:boolean;type:string|string[]|null;title:string|null;description:string|null;source:string}>;keysSource:string|null;valueType:'string';maxKeys:number;maxKeyLength:number;maxValueLength:number;maxEncodedPathBytes:number}
export function describeRequestPath(row:Original,method?:string):PathDeclaration;
export function bindRequestPath(row:Original,url:string,method?:string,pathValues?:Record<string,string>):PathBinding;
export function prepareRequestPath(row:Original,pathValues:Record<string,string>,method?:string):string;
export function selection(catalogue:Catalogue,input:SelectionInput,catalogueSha256:string):SelectedRequest;
export function challenge(selection:SelectedRequest,value:Original,index:number):{actualTerms:Original;pathBinding:PathBinding;changedAmount:boolean;acceptIndex:number;envelope:{mode:'ORIGINAL_UNSIGNED_CATALOG';source:string;sourceEnvelope:'resources';originalListings:Original[]}};
