export type Sha256 = string;
export type OriginalId = string;
export type Json = null | boolean | number | string | Json[] | {[key:string]: Json};
export interface ObjectFile { sha256: Sha256; bytes: number; name?: string; path?: string; mime?: string }
export interface Artifact { id: Sha256; kind: string; version: number | null; bytes:number; name:string; imported_at:string; metadata:Record<string,Json>; supported:boolean; node_count:number; warnings:string[] }
export interface Edition { id:Sha256; title:string; created_at:string; manifest:Sha256; catalog:Sha256|null; runs:Sha256[]; freshness:Sha256[]; context:Record<string,Json> }
export interface EditionInput { title:string; manifest:Sha256; catalog?:Sha256|null; runs?:Sha256[]; freshness?:Sha256[]; request_id:string }
export interface ReviewDecision { status:'accepted'|'investigate'|'excluded'|'correction-proposed'; note?:string; proposed_code?:string }
export interface ReviewInput { name:string; edition:Sha256; baseline?:Sha256|null; selection:OriginalId[]; decisions:Record<OriginalId,ReviewDecision>; reviewer:string; note?:string; expected_revision?:number; request_id:string }
export interface Review extends Omit<ReviewInput,'request_id'|'expected_revision'> { id:Sha256; schema:string; revision:number; previous:Sha256|null; created_at:string }
export interface Outcome { artifact:Sha256; ordinal:number; uid:OriginalId; status:string|null; execution_time:string|null; source_json:string; kind:string; metadata:Record<string,Json> }
export interface NodeSummary { uid:OriginalId; name:string; type:string; package:string; path:string; description:string; database_name:string|null; schema_name:string|null; relation_name:string|null; definition_sha:Sha256; compiled_sha:Sha256 }
export interface NodeDetail extends NodeSummary { artifact:Sha256; source_json:string; raw_code:string|null; compiled_code:string|null; outcomes:Outcome[]; results:ResultBinding[]; catalog:{artifact:Sha256;source_json:string}|null; dependencies:{parent:OriginalId;origin:string}[]; dependants:{child:OriginalId;origin:string}[] }
export interface NodePage { edition:Sha256; total:number; offset:number; next_offset:number|null; items:NodeSummary[] }
export interface Comparison { before:Sha256; after:Sha256; counts:Record<string,number>; changes:Record<string,Json>[]; affected:OriginalId[]; unresolved_affected:OriginalId[] }
export interface ResultBindingInput { edition:Sha256; uid:OriginalId; file:string; expected_sha:Sha256; query_file:string; provenance_file:string; source_kind:string; original_request_id:string; request_id:string }
export interface ResultBinding { id:Sha256; schema:string; edition:Sha256; uid:OriginalId; file:ObjectFile; query:ObjectFile; provenance:ObjectFile; source_kind:string; original_request_id:string; created_at:string }
export interface ProjectStatus { id:string; title:string; schema:string; created_at:string; counts:{artifacts:number; editions:number; reviews:number; results:number} }
export interface Received { path:string; workspace_id:string; archive_sha256:Sha256; recovered?:boolean; artifacts:number; editions:number; reviews:number; results:number }
export interface ClientOptions { directory:string; python?:string; maxResponseBytes?:number }
export declare class DbtProjectError extends Error {code:string; constructor(code:string,message?:string,details?:Record<string,unknown>)}
export declare function ensure(value:unknown,code:string,message?:string):asserts value;
export declare function digestFile(path:string):Promise<ObjectFile>;
export declare class DbtProjectClient {
 readonly directory:string; readonly python:string; readonly maxResponseBytes:number;
 constructor(options:ClientOptions);
 create(title:string):Promise<ProjectStatus>; invoke<T=Json>(action:string,input?:Record<string,unknown>,options?:{signal?:AbortSignal}):Promise<T>;
 status():Promise<ProjectStatus>; artifacts():Promise<Artifact[]>; editions():Promise<Edition[]>; import(file:string,expected_sha?:Sha256):Promise<Artifact>;
 createEdition(input:EditionInput):Promise<Edition>; nodes(edition:Sha256,input?:{q?:string;type?:string;offset?:number;limit?:number}):Promise<NodePage>;
 node(edition:Sha256,uid:OriginalId):Promise<NodeDetail>; compare(before:Sha256,after:Sha256):Promise<Comparison>;
 saveReview(input:ReviewInput):Promise<Review>; bindResult(input:ResultBindingInput):Promise<ResultBinding>;
 report(edition:Sha256,input?:{review?:Sha256;format?:'json'|'csv'|'html';output?:string}):Promise<ObjectFile>;
 export(output:string,expected_archive_sha?:Sha256):Promise<ObjectFile & {object:ObjectFile}>;
 receive(archive_file:string,destination:string,expected_sha:Sha256):Promise<Received>;
 copyObject(sha256:Sha256,output:string):Promise<ObjectFile>; close():Promise<void>;
}
export interface ConfiguredInput {path:string;sha256:Sha256;label?:string}
export interface ConfiguredWorkspace extends ClientOptions {label?:string;inputs:Record<string,ConfiguredInput>;exportsDirectory:string;receiveRoot:string}
export interface DbtProjectConfiguration {schema:'stellar-forge.dbt-project-connections.v1';workspaces:Record<string,ConfiguredWorkspace>}
export declare function readDbtProjectConfiguration(file:string):Promise<DbtProjectConfiguration>;
export declare function readConfiguredInput(entry:ConfiguredWorkspace,alias:string,expected?:Sha256):Promise<ConfiguredInput & ObjectFile>;
