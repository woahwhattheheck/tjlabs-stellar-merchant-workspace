import type {ContentSearch} from '../content-search/engine.mjs';
import type {ResearchExtension} from '../content-search/server.mjs';
import type {ReadingExchange} from './exchange.mjs';
export function readingExchangeExtension(search:ContentSearch,options?:{python?:string}):Promise<ResearchExtension&{exchange:ReadingExchange}>;
