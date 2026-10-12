import type {Query,SearchPage,Page,Passage,SearchResult,ResearchStatus,SaveQuery,SavedQuery,DeleteQuery,DeletedQuery,FullPassage} from './engine.mjs';
export interface RequestOptions {signal?:AbortSignal}
export interface DownloadTicket {url:string;bytes:number;sha256:string}
export class ResearchClient {
 constructor(options:{origin:string;token:string;fetch?:typeof globalThis.fetch});
 readonly origin:string;readonly token:string;
 request(path:string,options?:RequestOptions&{method?:string;body?:unknown}):Promise<unknown>;
 query(route:string,options?:Query):Promise<unknown>;
 status(options?:RequestOptions):Promise<ResearchStatus>;
 index(options?:RequestOptions):Promise<ResearchStatus>;
 cancel(options?:RequestOptions):Promise<{cancelled:boolean}>;
 search(options:Query):Promise<SearchPage>;
 passages(options:Query&{resourceId:string}):Promise<Page<Passage>>;
 page(options:{build?:string;resourceId:string;ordinal:number;signal?:AbortSignal}):Promise<FullPassage>;
 allResults(options:Query):AsyncGenerator<SearchResult>;
 allPassages(options:Query&{resourceId:string}):AsyncGenerator<Passage>;
 saved(options?:RequestOptions):Promise<{items:SavedQuery[]}>;
 save(value:SaveQuery,options?:RequestOptions):Promise<SavedQuery>;
 delete(value:DeleteQuery,options?:RequestOptions):Promise<DeletedQuery>;
 export(value:Query&{format?:'json'|'csv'|'html'},options?:RequestOptions):Promise<DownloadTicket>;
}
