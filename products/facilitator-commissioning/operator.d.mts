// SPDX-License-Identifier: MIT
import type {Buffer} from 'node:buffer';
import type {Command,Receipt,Receiving,OperatorState,HistoryPage,Upload,Json,InstallationCatalog,InstallationView,NativeInstallationCatalog,NativeInstallationView} from './client.mjs';
export const OPERATOR_SCHEMA:string,FILE_LIMIT:number,CHUNK_LIMIT:number;
export interface Operator {
  directory:string;
  state():Promise<OperatorState>;
  history(options?:{kind?:'results'|'runs'|'pending';offset?:number;limit?:number;revision?:number}):Promise<HistoryPage>;
  installations():Promise<InstallationCatalog>;
  installation(options:{id:string;kind?:'summary'|'files'|'sources';offset?:number;limit?:number}):Promise<InstallationView>;
  installationArchive(operationId:string):Promise<{path:string;filename:string;contentType:string;bytes:number;sha256:string}>;
  installationReceivings():Promise<NativeInstallationCatalog>;
  installationReceiving(options:{id:string;kind?:'summary'|'files'|'preview'|'saved'|'received'|'operation';offset?:number;limit?:number;expectedSnapshotSha256?:string}):Promise<NativeInstallationView>;
  originalRelease(releaseId:string):Promise<Json>;
  beginUpload(input:{id:string;name:string;bytes:number;sha256:string}):Promise<Upload>;
  uploadState(id:string):Promise<Upload>;
  uploadChunk(id:string,offset:number,body:Buffer):Promise<Upload>;
  completeUpload(id:string):Promise<Upload>;
  prepare(command:Command):Promise<{request:Command;replayed:boolean}>;
  receive(operationId:string):Promise<Receiving>;
  act(command:Command):Promise<Receipt>;
  readFile(options:{kind:string;id?:string;name?:string;snapshotSha256?:string}):Promise<{path?:string;body?:Uint8Array;bytes:number;sha256:string;filename:string;contentType:string}>;
  archive(operationId:string):Promise<{path:string;filename:string;contentType:string;bytes:number;sha256:string}>;
  close():Promise<void>;
}
export function openCommissioningOperator(options:{directory:string;store?:string;setupFile?:string;exportDirectory?:string}):Promise<Operator>;
