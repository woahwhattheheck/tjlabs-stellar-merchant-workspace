import type {ContentSearch,Query,IndexBuild} from './engine.mjs';
import type {FileHandle} from 'node:fs/promises';
export interface ReportOptions extends Query {format?:'json'|'csv'|'html'}
export interface ResearchReport {meta:{schema:string;createdAt:string;query:{q:string;mode:string};build:string;source:IndexBuild['binding'];coverage:{files:number;bytes:number;counts:IndexBuild['counts'];issues:IndexBuild['issues']};matchingFiles:number};format:string;filename:string;chunks(options?:{signal?:AbortSignal}):AsyncGenerator<string>}
export function researchReport(search:ContentSearch,options:ReportOptions):ResearchReport;
export function reportDownload(search:ContentSearch,options:ReportOptions,signal?:AbortSignal):Promise<{file:FileHandle;bytes:number;sha256:string;resource:{id:string;name:string};dispose():Promise<void>}>;
export function saveReport(search:ContentSearch,destination:string,options:ReportOptions):Promise<ResearchReport['meta']&{path:string;bytes:number;sha256:string}>;
