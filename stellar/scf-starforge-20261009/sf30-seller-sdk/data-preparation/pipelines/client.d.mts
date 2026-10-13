export interface OriginalReference { origin: string; run?: string; execution?: string; stage?: string; attempt?: number; [key:string]: unknown }
export interface ReceivedProject { id:string; label:string; path:string; archiveSha256:string; bytes:number; createdAt:string; pipelines:number; executions:number; sources:number; nativeRuns:number; origin?:string }
export interface RequestOptions { signal?: AbortSignal }
export type Selection = {input:string;stage?:never}|{stage:string;input?:never};
export interface Stage { id: string; label: string; description?: string; sql: string; parameters?: Record<string,string|number|boolean|null>; bindings: Record<string,Selection> }
export interface Definition { label: string; description?: string; inputs: Record<string,string>; stages: Stage[]; outputs?: string[] }
export interface SavedDefinition extends Definition { id: string; revision: number; createdAt: string; order: string[]; outputs: string[] }
export type RunStatus = 'QUEUED'|'RUNNING'|'WAITING'|'INTERRUPTED'|'CANCELLED'|'FAILED'|'COMPLETE';
export interface Attempt { importedFrom?:OriginalReference; retiredByAdoption?:boolean; number: number; token: string; status: string; nativeRecipe?: string; nativeRun?: string; nativeRevision?: number; bindings?: Record<string,string>; lineage?:Record<string,{stage:string;nativeRun:string;sourceId:string;sha256:string;format:'csv'|'jsonl';rows:number}>; createdAt: string; finishedAt?: string; message?: string }
export interface StageState { reuseFrom?:{execution:string;stage:string;signature:string}; reusedAt?:string; reuseDecision?:string; importedFrom?:OriginalReference; status: RunStatus|'PENDING'; attempts: Attempt[]; rows?: number; columns?: string[]; nativeRun?: string; resultDigest?: string }
export interface Execution { nativeEngineSha256?:string; reuseExecution?:string; importedFrom?:OriginalReference; id: string; pipelineId: string; revision: number; definition: SavedDefinition; requestKey: string; requestDigest: string; inputs: Record<string,string>; inputOriginals: Record<string,Source>; status: RunStatus; stages: Record<string,StageState>; outputs?: Record<string,string>; createdAt: string; startedAt?: string; finishedAt?: string; message?: string }
export interface Source { id:string; alias:string; label:string; format:'csv'|'jsonl'; originalName:string; rows:number; columns:string[]; sha256:string; bytes:number; nullCounts:number[]; emptyCounts:number[];nullToken?:string|null;createdAt?:string }
export interface Page<T> {items:T[];offset:number;total:number;nextOffset:number|null}
export interface RowPage {columns:string[];rows:(string|null)[][];offset:number;total:number;nextOffset:number|null}
export interface Event {sequence:number;type:string;at:string;details:Record<string,unknown>}
export interface Delivery {download:string;bytes:number;sha256:string}
export interface Review {id:string;revision:number;history:{decision:'accept'|'revise'|'withdraw';reviewer:string;note:string;createdAt:string}[]}
export interface Comparison {schema:string;before:string;after:string;inputChanges:{input:string;before:string|null;after:string|null}[];stages:{stage:string;label:string;beforeRows:number|null;afterRows:number|null;sameOrderedResult:boolean|null}[];semantics:string}
export class PipelineClient {
 constructor(origin:string, options?:{fetch?:typeof fetch});
 state(options?:RequestOptions):Promise<{schema:string;label:string;sources:Source[];recipes:Record<string,unknown>[];reviews:Review[];pipelines:Page<SavedDefinition>;executions:Page<Execution>}>;
 list(collection:'pipelines', options?:RequestOptions&{offset?:number;limit?:number}):Promise<Page<SavedDefinition>>;
 list(collection:'executions', options?:RequestOptions&{offset?:number;limit?:number}):Promise<Page<Execution>>;
 definition(id:string, options?:RequestOptions&{revision?:number}):Promise<SavedDefinition>;
 save(definition:Definition,options?:RequestOptions&{pipelineId?:string;expectedRevision?:number}):Promise<SavedDefinition>;
 fromRecipe(id:string, options?:RequestOptions&{revision?:number}):Promise<Definition>;
 enqueue(id:string,requestKey:string,options?:RequestOptions&{revision?:number;inputs?:Record<string,string>;reuseExecution?:string}):Promise<Execution>;
 execute(id:string,options?:RequestOptions&{resume?:boolean}):Promise<Execution>;
 execution(id:string,options?:RequestOptions):Promise<Execution>;
 cancel(id:string,options?:RequestOptions):Promise<{id:string;requested:boolean}>;
 recover(options?:RequestOptions):Promise<{executions:string[];native:{recovered:string[]}}>;
 events(id:string,options?:RequestOptions&{after?:number;limit?:number}):Promise<{items:Event[];nextAfter:number|null}>;
 rows(id:string,stage:string,options?:RequestOptions&{offset?:number;limit?:number}):Promise<RowPage>;
 review(id:string,stage:string,options:RequestOptions&{decision:'accept'|'revise'|'withdraw';reviewer:string;note?:string;expectedRevision?:number}):Promise<Review>;
 compare(before:string,after:string,options?:RequestOptions):Promise<Comparison>;
 exportProject(options?:RequestOptions):Promise<Delivery>;
 report(id:string,options?:RequestOptions):Promise<Delivery>;
 deliver(id:string,options?:RequestOptions):Promise<Delivery>;
 merchant(id:string,stage:string,options?:RequestOptions):Promise<Delivery>;
 resultURL(id:string,stage:string,file?:'result.jsonl'|'result.csv'|'schema.json'):string;
 importFile(path:string,options:{alias:string;format?:'csv'|'jsonl';label?:string;filename?:string;nullToken?:string;signal?:AbortSignal}):Promise<Source>;
 received(options?:RequestOptions):Promise<{items:ReceivedProject[]}>;
 openReceived(id:string,options?:RequestOptions):Promise<ReceivedProject&{origin:string}>;
 receiveProject(path:string,options:{requestKey:string;signal?:AbortSignal}):Promise<ReceivedProject&{origin:string}>;
 all(collection?:'pipelines',options?:RequestOptions&{pageSize?:number}):AsyncGenerator<SavedDefinition>;
 all(collection:'executions',options?:RequestOptions&{pageSize?:number}):AsyncGenerator<Execution>;
 all(collection:'pipelines'|'executions',options?:RequestOptions&{pageSize?:number}):AsyncGenerator<SavedDefinition|Execution>;
 allRows(id:string,stage:string,options?:RequestOptions&{pageSize?:number}):AsyncGenerator<Record<string,string|null>>;
 allEvents(id:string,options?:RequestOptions&{pageSize?:number}):AsyncGenerator<Event>;
 wait(id:string,options?:RequestOptions&{intervalMs?:number}):Promise<Execution>;
 download(relative:string,destination:string,options?:RequestOptions&{sha256?:string;bytes?:number}):Promise<{path:string;sha256:string;bytes:number}>;
}
