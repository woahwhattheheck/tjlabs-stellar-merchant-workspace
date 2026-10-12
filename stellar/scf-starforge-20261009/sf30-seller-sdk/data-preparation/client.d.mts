export interface RequestOptions { signal?: AbortSignal }
export type Cell = string | null;
export interface Page { columns: string[]; rows: Cell[][]; offset: number; total: number; nextOffset: number | null }
export interface Source { id: string; alias: string; label: string; format: 'csv'|'jsonl'; originalName: string; sha256: string; bytes: number; rows: number; columns: string[]; nullCounts: number[]; emptyCounts: number[]; nullToken: string|null; createdAt: string }
export interface RecipeInput { label: string; sql: string; bindings: Record<string,string>; parameters?: Record<string,string|number|boolean|null>; id?: string; expected_revision?: number; note?: string }
export interface Recipe extends Omit<RecipeInput,'expected_revision'> { id: string; revision: number; parameters: Record<string,string|number|boolean|null>; createdAt: string }
export interface Run { id: string; label: string; recipe: Recipe; status:'QUEUED'|'RUNNING'|'COMPLETE'|'FAILED'|'CANCELLED'|'INTERRUPTED'; createdAt: string; startedAt?: string; finishedAt?: string; rows: number; columns?: string[]; message?: string; previousRun: string|null; files?: Record<string,{bytes:number;sha256:string}> }
export interface ReviewInput { run_id: string; decision:'accept'|'revise'|'withdraw'; reviewer:string; note:string; expected_revision?:number }
export interface Review { id:string; revision:number; history:Array<{decision:ReviewInput['decision'];reviewer:string;note:string;createdAt:string}> }
export interface State { schema:string;label:string;createdAt:string;sources:Source[];recipes:Recipe[];runs:Run[];reviews:Review[] }
export interface Download { url:string;bytes?:number;rows?:number }
export class PreparationClient {
 constructor(origin:string,options?:{fetchImpl?:typeof fetch});
 state(options?:RequestOptions):Promise<State>;
 importFile(file:string,options:{alias:string;format?:'csv'|'jsonl';label?:string;nullToken?:string;signal?:AbortSignal}):Promise<Source>;
 sourcePage(id:string,options?:RequestOptions&{offset?:number;limit?:number}):Promise<Page>;
 resultPage(id:string,options?:RequestOptions&{offset?:number;limit?:number}):Promise<Page>;
 saveRecipe(recipe:RecipeInput,options?:RequestOptions):Promise<Recipe>;
 run(recipeId:string,revision?:number,options?:RequestOptions):Promise<Run>;
 start(runId:string,options?:RequestOptions):Promise<Run>;
 rerun(runId:string,options?:RequestOptions):Promise<Run>;
 cancel(runId:string,options?:RequestOptions):Promise<{id:string;requested:boolean}>;
 recover(options?:RequestOptions):Promise<{recovered:string[]}>;
 review(review:ReviewInput,options?:RequestOptions):Promise<Review>;
 exportWorkspace(options?:RequestOptions):Promise<Download>;
 merchant(runId:string,options?:RequestOptions):Promise<Download>;
 report(runId:string,options?:RequestOptions):Promise<Download>;
 resultURL(runId:string,file?:'result.csv'|'result.jsonl'|'schema.json'):string;
 downloadURL(relative:string):string;
 resultRows(runId:string,options?:RequestOptions&{pageSize?:number}):AsyncGenerator<Record<string,Cell>>;
}
