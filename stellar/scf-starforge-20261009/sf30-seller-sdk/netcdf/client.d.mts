/// MIT. Original values remain native tagged JSON; no scientific unit conversion is implicit.
export type NativeValue = null | boolean | number | string | NativeValue[] | {[name: string]: NativeValue};
export type NativeInteger = {kind:'integer';value:string};
export type NativeFloat = {kind:'float';value:'NaN'|'Infinity'|'-Infinity'};
export type NativeBytes = {kind:'bytes';base64:string};
export type NativeCompound = {kind:'compound';fields:Record<string,NativeValue>};
export type NativeMissing = {kind:'missing'};
export type NativeComplex = {kind:'complex';real:NativeValue;imaginary:NativeValue};
export interface WorkspaceBinding {schema:'stellar-forge.netcdf-binding.v1';project_id:string;directory:string;sha256:string}
export interface Project {id:string;title:string;revision:number;created_at:string}
export interface Dimension {name:string;path:string;size:number;unlimited:boolean}
export interface Variable {path:string;name:string;group:string;dtype:string;type_kind:'primitive'|'enum'|'compound'|'vlen';enum?:Record<string,number>;dtype_description?:NativeValue;shape:number[];dimensions:Dimension[];attributes:Record<string,NativeValue>;cf:Record<string,NativeValue>;selectable:boolean}
export interface Group {path:string;attributes:Record<string,NativeValue>}
export interface Source {id:string;name:string;sha256:string;bytes:number;mime:string;reference:string;imported_at:string;catalog:{format:string;attributes:Record<string,NativeValue>;groups:Group[];dimensions:Dimension[];variables:Variable[]}}
export interface Slice {start?:number;stop?:number;step?:number}
export type Slices=Record<string,Slice>;
export interface VariableChoice {path:string;slices?:Slices}
export interface PreparedVariable extends VariableChoice {role:string}
export interface Selection {id:string;title:string;source_id:string;source_sha256:string;variables:PreparedVariable[];decode_cf:boolean;include_coordinates:boolean;created_at:string}
export interface FileDescriptor {name:string;sha256:string;bytes:number;mime:string;path?:string}
export interface Result {id:string;title:string;selection_id:string;source_id:string;source_sha256:string;created_at:string;cells:number;variables:Array<Variable&{role:string;selection:{slices:Slices;shape:number[];cells:number}}>;files:FileDescriptor[];status:'complete'}
export type ReviewDecision='accepted'|'needs-work'|'observed'|'excluded';
export interface Review {id:string;run_id:string;decision:ReviewDecision;reviewer:string;notes:string;created_at:string}
export interface Overview {schema:'stellar-forge.netcdf-workspace.v1';project:Project;sources:Source[];selections:Selection[];runs:Result[];reviews:Review[]}
export interface Collection<T> {items:T[];total:number}
export interface Page<T> extends Collection<T> {next_offset:number|null}
export interface ValueRow {index:number[];raw:NativeValue;decoded?:NativeValue;calendar_value?:NativeValue}
export interface Preview {variable:Variable;selection:{slices:Slices;shape:number[];cells:number};items:ValueRow[];total:number;next_offset:number|null}
export interface ClientOptions {directory:string;python?:string;maxResponseBytes?:number}
export interface ImportOptions {name?:string;reference?:string;request_id?:string;expected_sha?:string}
export interface SelectionInput {title:string;source_id:string;variables:VariableChoice[];decode_cf?:boolean;include_coordinates?:boolean;expected_revision?:number;request_id?:string}
export interface ReviewInput {run_id:string;decision:ReviewDecision;reviewer:string;notes:string;expected_revision?:number;request_id?:string}
export interface ObjectDescription {sha256:string;bytes:number}
export interface ObjectPage {sha256:string;offset:number;total:number;base64:string;next_offset:number|null}
export interface ObjectChunk {sha256:string;offset:number;total:number;bytes:Buffer;next_offset:number|null}
export interface ObjectCopy extends ObjectDescription {path:string}
export interface WorkspaceEntry extends ClientOptions {label?:string;project_id?:string;sha256?:string;inputs:Record<string,{path:string;sha256:string;name?:string;reference?:string}>;exportsDirectory:string;receiveRoot:string}
export interface NetCDFConfiguration {schema:'stellar-forge.netcdf-connections.v1';workspaces:Record<string,WorkspaceEntry>}
export declare const NETCDF_CONFIGURATION_SCHEMA:'stellar-forge.netcdf-connections.v1';
export declare function plain(value:unknown):value is Record<string,unknown>;
export declare function need(value:unknown,code:string,message?:string):asserts value;
export declare class NetCDFError extends Error {code:string;details:Record<string,unknown>;constructor(code:string,message?:string,details?:Record<string,unknown>)}
export declare function digestFile(path:string):Promise<ObjectDescription>;
export declare function readNetCDFConfiguration(file:string):Promise<NetCDFConfiguration>;
export declare function readConfiguredInput(entry:WorkspaceEntry,alias:string,expected:string):Promise<{path:string;sha256:string;bytes:number;name?:string;reference?:string}>;
export declare class NetCDFWorkspaceClient {
  readonly directory:string;readonly python:string;readonly maxResponseBytes:number;readonly processId:number|undefined;
  constructor(options:ClientOptions);
  call<T=unknown>(method:string,params?:Record<string,unknown>):Promise<T>;
  binding():Promise<WorkspaceBinding>;overview():Promise<Overview>;
  sources():Promise<Collection<Source>>;source(id:string):Promise<Source>;
  importFile(path:string,options?:ImportOptions):Promise<Source>;
  variables(source_id:string,options?:{offset?:number;limit?:number;query?:string}):Promise<Page<Variable>>;
  variable(source_id:string,path:string):Promise<Variable>;
  preview(source_id:string,path:string,options?:{slices?:Slices;decode_cf?:boolean;offset?:number;limit?:number}):Promise<Preview>;
  saveSelection(input:SelectionInput):Promise<Selection>;selections():Promise<Collection<Selection>>;selection(id:string):Promise<Selection>;
  run(selection_id:string,options?:{request_id?:string}):Promise<Result>;runs():Promise<Collection<Result>>;result(id:string):Promise<Result>;
  saveReview(input:ReviewInput):Promise<Review>;reviews():Promise<Collection<Review>>;report(run_id:string):Promise<FileDescriptor>;
  objectDescribe(sha256:string):Promise<ObjectDescription>;objectRead(sha256:string,options?:{offset?:number;limit?:number}):Promise<ObjectPage>;
  exportProject(output?:string):Promise<FileDescriptor>;
  receiveProject(path:string,destination:string,expected_sha:string):Promise<{directory:string;binding:WorkspaceBinding}>;
  allVariables(source_id:string,options?:{pageSize?:number;query?:string}):AsyncGenerator<Variable>;
  previewRows(source_id:string,path:string,options?:{pageSize?:number;slices?:Slices;decode_cf?:boolean}):AsyncGenerator<ValueRow>;
  objectChunks(sha256:string,options?:{offset?:number;pageBytes?:number}):AsyncGenerator<ObjectChunk>;
  copyObject(sha256:string,output:string,options?:{pageBytes?:number}):Promise<ObjectCopy>;
  close():Promise<{code:number|null;signal:NodeJS.Signals|null}>;
}
export {NetCDFWorkspaceClient as NetCDFClient};
