import type { Buffer } from 'node:buffer';
import type { Actions,Mutation,MutationResult,RecordSelection,RecordPage,Project,Identity,Json,MaximoMapping,FileSelection,OperationSummary } from './client.mjs';
export type CallTool = (name:string,args:Record<string,unknown>)=>Promise<unknown>;
export interface FileMetadata {name:string;contentType:string;bytes:number;sha256:string;}
export interface FileContinuation {readId?:string;expectedSha256?:string;offset?:number;limit?:number;}
export interface FileChunk {readId:string;file:FileMetadata;offset:number;bytesRead:number;nextOffset:number|null;encoding:'base64';data:string;}
export interface PageInput {offset?:number;limit?:number;query?:string;}
export interface HostInputSelection {input:string;expectedSha256:string;}
export type ProjectSection = 'findings'|'inputs'|'mappings'|'decisions'|'repairs'|'changes'|'exclusions'|'work_order_overrides'|'history'|'releases'|'native_runs'|'settings';
export interface ProjectSelection {projectId:string;expectedRevision:number;}
export class MunicipalAssetMerchantClient {
  constructor(callTool:CallTool,workspace:string);
  call(name:string,input?:Record<string,unknown>):Promise<unknown>;
  workspaces():Promise<{workspaces:Array<Record<string,Json>>}>;
  status():Promise<Identity & {projects:Project[]}>;
  project(input:ProjectSelection):Promise<Record<string,Json>>;
  projectSection(input:ProjectSelection & PageInput & {section:ProjectSection}):Promise<{projectId:string;revision:number;section:ProjectSection;total:number;offset:number;limit:number;items:Json[];nextOffset:number|null}>;
  records(input:RecordSelection):Promise<RecordPage>;
  input(input:{input:string}):Promise<{input:string;label:string;name:string;kind:string;format:string;bytes:number;sha256:string}>;
  createProject(input:{requestId:string;title:string;mode:'development'|'public-reference'|'vendor-authorized'}):Promise<{id:string;revision:number}>;
  importInput(input:Mutation & HostInputSelection):Promise<MutationResult>;
  saveMapping(input:Mutation & Actions['mapping']):Promise<MutationResult>;
  selectInput(input:Mutation & Actions['select_input']):Promise<MutationResult>;
  saveSettings(input:Mutation & Actions['settings']):Promise<MutationResult>;
  review(input:Mutation & Actions['review']):Promise<MutationResult>;
  exclude(input:Mutation & Actions['exclude']):Promise<MutationResult>;
  proposeRepair(input:Mutation & Actions['repair']):Promise<MutationResult>;
  requestStatus(input:Mutation & Actions['request_status']):Promise<MutationResult>;
  applyReturns(input:Mutation):Promise<MutationResult>;
  withdrawChange(input:Mutation & Actions['withdraw_change']):Promise<MutationResult>;
  nativeCheck(input:Mutation):Promise<MutationResult>;
  release(input:Mutation & Actions['release']):Promise<MutationResult & {release_id:string}>;
  restoreRevision(input:Mutation & Actions['restore_revision']):Promise<MutationResult>;
  refreshStatus(input:{projectId:string} & PageInput):Promise<{projectId:string;total:number;offset:number;limit:number;items:Json[];nextOffset:number|null}>;
  refreshStart(input:Mutation & {pageWidth?:number;geometryWidth?:number;sourceOperation?:string}):Promise<Record<string,Json>>;
  refreshResume(input:{requestId:string;projectId:string;refreshOperation:string}):Promise<Record<string,Json>>;
  maximoStatus(input:{projectId:string;section:'profiles'|'captures'|'loads'} & PageInput):Promise<{projectId:string;section:string;total:number;offset:number;limit:number;items:Json[];nextOffset:number|null}>;
  maximoStart(input:Mutation & {profileId:string}):Promise<Record<string,Json>>;
  maximoResume(input:{requestId:string;projectId:string;captureOperation:string}):Promise<Record<string,Json>>;
  maximoReceive(input:Mutation & {captureOperation:string}):Promise<MutationResult>;
  maximoPrepareLoad(input:Mutation & {captureOperation:string;mapping:MaximoMapping}):Promise<{id:string;rows:number;body_sha256:string}>;
  maximoReceiveLoad(input:{projectId:string;requestId:string;loadId:string} & HostInputSelection):Promise<{load_id:string;receive_id:string;rows:number;findings:Json[]}>;
  maximoResult(input:{projectId:string;operationId:string;offset?:number;limit?:number}):Promise<Record<string,Json>>;
  operation(requestId:string):Promise<OperationSummary>;
  replayOperation(requestId:string):Promise<Json>;
  readFile(selection:FileSelection,continuation?:FileContinuation):Promise<FileChunk>;
  releaseFile(readId:string):Promise<unknown>;
  downloadFile(selection:FileSelection,options?:{limit?:number;maximumBytes?:number;onChunk?:(bytes:Buffer,context:{file:FileMetadata;offset:number})=>Promise<void>|void}):Promise<{file:FileMetadata;bytesRead:number;bytes?:Buffer}>;
}
