export type UUID = string;
export type JoinKey = {leftAlias:string;leftColumn:string;rightColumn:string};
export type JoinSource = {source:UUID;as:string};
export type Join = JoinSource & {kind:'inner'|'left'|'full';on:JoinKey[];cardinality?:'many-to-one'|'many-to-many';emptyKeys?:'match'|'unmatched'};
export type RecipeSpec = {name:string;base:JoinSource;joins:Join[];columns:{source:string;column:string;name:string}[]};
export type Recipe = {id:UUID;version:number;spec:RecipeSpec;created:string};
export type Source = {id:UUID;label:string;headers:string[];rows:number;sha256:string;bytes:number;delimiter:string;nullToken:string|null;reference:string;created:string};
export type Review = {revision:number;decision:'unreviewed'|'accepted'|'needs-work'|'archived';reviewer:string;note:string;created?:string};
export type Edition = {id:UUID;recipe:Recipe;rows:number;columns:string[];sources:Record<string,Source>;sourceOrder:string[];missingSourceRows:Record<string,number>;diagnostics:{alias:string;kind:string;duplicateKeyGroups:number;extraMatchingRows:number}[];sqliteSha256:string;created:string;review?:Review};
export type Export = {id:UUID;kind:'csv'|'sqlite'|'customer'|'workspace';filename:string;bytes:number;sha256:string};
export type Page = {edition:UUID;columns:string[];rows:{row:number;values:(string|null)[];origins:Record<string,number|null>}[];total:number;next:number|null};
export type State = {workspace:{schema:string;id:UUID;label:string;created:string};sources:Source[];recipes:Recipe[];editions:Edition[];pending:{id:UUID;action:string;created:string}[];pagination:Record<'sources'|'recipes'|'editions',{offset:number;total:number;nextOffset:number|null}>};
export class BlendClientError extends Error {code:string;status?:number;constructor(code:string,message?:string);}
export class BlendClient {
 constructor(options:{directory:string;python?:string;maxResponseBytes?:number});
 readonly directory:string; readonly python:string;
 invoke<T=unknown>(action:string,input?:Record<string,unknown>):Promise<T>;
 state(options?:{offset?:number;limit?:number}):Promise<State>;
 importCSV(file:string,label:string,options?:{request?:UUID;delimiter?:string;nullToken?:string|null;expectedSha256?:string;sourceReference?:string}):Promise<Source>;
 saveRecipe(spec:RecipeSpec,options?:{request?:UUID;recipe?:UUID|null;expectedVersion?:number}):Promise<Recipe>;
 run(recipe:UUID,version:number,options?:{request?:UUID}):Promise<Edition>;
 rows(edition:UUID,options?:{after?:number;limit?:number}):Promise<Page>;
 review(edition:UUID,options:{decision:'accepted'|'needs-work'|'archived';note?:string;reviewer:string;expectedRevision?:number;request?:UUID}):Promise<Review>;
 export(edition:UUID,options?:{kind?:'csv'|'sqlite'|'customer';request?:UUID;nullToken?:string}):Promise<Export>;
 backup(options?:{request?:UUID}):Promise<Export>;
 resume<T=unknown>(request:UUID):Promise<T>;
 copyExport(request:UUID,destination:string):Promise<{path:string;bytes:number;sha256:string}>;
 interrupt():void; close():Promise<unknown>;
}
export function digestFile(path:string):Promise<{bytes:number;sha256:string}>;
export function readBlendConfiguration(file:string):Promise<{workspaces:Record<string,{directory:string;python?:string;label?:string;receiveRoot:string;inputs:Record<string,{path:string;sha256:string;label?:string}>}>}>;
