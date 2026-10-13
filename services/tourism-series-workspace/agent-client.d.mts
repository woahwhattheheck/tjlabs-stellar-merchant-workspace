/// <reference types="node" />
/** Complete original Tourism workspace client. All times and operation IDs are caller-owned. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export interface Genesis { id: string; title: string; createdAt: string }
export interface OriginalInput { path: string; sha256: string; bytes: number; filename: string; kind: 'original'|'csv'|'operation'; label?: string }
export interface Connection { label: string; workspacePath: string; operationsDirectory: string; genesis: Genesis; genesisSha256?: string; inputs: Record<string,OriginalInput> }
export interface Configuration { schema: 'stellar-forge.tourism-series-agent.v1'; workspaces: Record<string,Connection> }
export interface Pin { expectedRevision: number; expectedHead: string }
export interface Page { offset?: number; limit?: number }
export interface SeriesSelection { registryId: string; sourceIds: string[] }
export interface AnalysisSelection extends SeriesSelection { kind: 'sum'|'difference'|'percentage_change'|'ratio'|'reconcile'; rowIds: string[]; dimension?: string; partitionId?: string; ratioPairId?: string; reconciliationId?: string; tolerance?: string }
export interface Operation { operationId: string; expectedRevision: number; at: string }
export interface ImportFile extends Operation { id: string; filename: string; mime_type: string; content_base64?: string; source_url?: string; publisher?: string; published_at?: string; retrieved_at: string; representation: 'original'|'authored_transcription'|'extracted_text'; note?: string }
export interface ImportCsv extends Operation { id: string; role: 'source'|'target'; filename: string; text?: string }
export interface Registry extends Operation { registry: { id: string; source_file_ids: string[]; [key: string]: Json } }
export interface Mapping extends Operation { sourceId: string; registryId: string; columns: Record<string,number>; constants: Record<string,string> }
export interface Correction extends Operation { sourceId: string; rowId: string; column: number; value: string; actor: string; reason: string }
export interface SavedAnalysis extends Operation { id: string; title: string; actor: string; note: string; analysis: AnalysisSelection }
export interface Report extends Operation { id: string; title: string; actor: string; note: string; analysisIds: string[] }
export interface Target extends Operation, SeriesSelection { id: string; rowIds: string[]; templateFileId: string; columns: Array<{column:number;field:string}|{column:number;constant:string}>; keyColumns:number[]; actor:string; note:string }
export interface Returned extends Operation { id:string; planId:string; sourceId:string; columns:Array<{preparedColumn:number;returnedColumn:number}>; actor:string; note:string }
export interface ActionInputs { importFile: ImportFile; importCsv: ImportCsv; saveRegistry: Registry; saveMapping: Mapping; saveCorrection: Correction; saveAnalysis: SavedAnalysis; saveReport: Report; prepareTarget: Target; recordTargetReturn: Returned }
export type Action=keyof ActionInputs;
export type Section='files'|'sources'|'registries'|'mappings'|'mappingHistory'|'corrections'|'analyses'|'reports'|'targetPlans'|'targetReturns'|'operations'|'drafts'|'selection';
export interface Status extends Genesis { revision:number; headSha256:string; genesisSha256:string; format:'workspace'|'recovery'; copyId:string|null; unfinishedForms:string[]; collections:Record<string,number>; selection:Record<string,Json> }
export interface SavedReceipt { schema:string; requestSha256:string; operationId:string; workspaceId:string; revision:number; receipt:Json; replayed:boolean; current:Status }
export interface Paged<T=Json> { items:T[]; total:number; offset:number; nextOffset:number|null }
export type FileKind='workspace'|'source'|'original'|'report'|'target'|'returned'|'working-html'|'handover'|'operation';
export interface CompleteFile { name:string; type:string; bytes:Buffer }
export declare const CONFIG_SCHEMA:'stellar-forge.tourism-series-agent.v1';
export declare const ACTIONS:Action[];
export declare const SECTIONS:Section[];
export declare function readTourismConfiguration(file:string):Configuration;
export declare class TourismSeriesClient {
 constructor(entry:Connection);
 status():Status;
 section(input:Pin & Page & {section:Section}):Paged & {workspaceId:string;revision:number;headSha256:string;section:Section};
 rows(input:Pin & Page & {sourceId:string}):Paged & {headers:string[];sourceId:string;workspaceId:string;revision:number;headSha256:string};
 project(input:Pin & Page & SeriesSelection):Paged & {registryId:string;basis_sha256:string;issues:Json[];coverage:Json;ready:boolean};
 calculate(input:Pin & AnalysisSelection):{workspaceId:string;revision:number;headSha256:string;result:Json};
 mutate<A extends Action>(action:A,input:ActionInputs[A],options?:{inputAlias?:string|null;expectedSha256?:string|null;expectedHead?:string|null}):Promise<SavedReceipt>;
 applyInput(input:{operationId:string;inputAlias:string;expectedSha256:string;expectedHead?:string|null}):Promise<SavedReceipt>;
 replay(operationId:string):Promise<SavedReceipt>;
 operation(operationId:string):{operationId:string;action:Action;requestSha256:string;state:'PREPARED'|'COMMITTED';committedRevision:number|null;receiptSaved:boolean;current:Status};
 originalFile(input:{kind:FileKind;id?:string;expectedRevision?:number;expectedHead?:string;operationId?:string}):Promise<CompleteFile>;
 close():Promise<void>;
}
