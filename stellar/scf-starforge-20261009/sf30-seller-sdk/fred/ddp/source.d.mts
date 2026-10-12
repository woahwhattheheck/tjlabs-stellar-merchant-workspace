import type { FredDdpSourceFile,FredDdpFileDescriptor } from './files.mjs';
import type { FredDdpCrosswalkCapture,FredDdpCrosswalkModel } from './crosswalk.mjs';
import type { FredDdpPackageCapture,FredDdpPackageModel,FredDdpPackageFormat,FredDdpCsvLayout } from './package.mjs';
export type FredDdpSourceKind='crosswalk'|'package';
export interface FredDdpOriginalSourceRequest {url:string;name:string|null;}
export type FredDdpAcquisitionRequest=
  | {kind:'crosswalk';sources:FredDdpOriginalSourceRequest[]}
  | {kind:'package';sources:FredDdpOriginalSourceRequest[];release:string;format:FredDdpPackageFormat;csvLayout:FredDdpCsvLayout|null};
export interface FredDdpAcquisitionInput {
  directory:string;url?:string;name?:string|null;release?:string;format?:FredDdpPackageFormat;
  supplementalUrls?:Array<string|{url:string;name?:string|null}>;csvLayout?:FredDdpCsvLayout|null;
  signal?:AbortSignal;fetchImpl?:typeof fetch;
  onProgress?:(progress:{files:number;total:number;name:string;bytes:number;sha256:string})=>void|Promise<void>;
}
export interface FredDdpSourceResult<Capture,Model> {directory:string;capture:Capture;model:Model;reused:boolean;}
export type FredDdpCrosswalkSourceResult=FredDdpSourceResult<FredDdpCrosswalkCapture,FredDdpCrosswalkModel>;
export type FredDdpPackageSourceResult=FredDdpSourceResult<FredDdpPackageCapture,FredDdpPackageModel>;
export interface FredDdpAcquisitionError {code:string;status:number|null;message:string;at:string;retryAt:string|null;}
export interface FredDdpAcquisitionStatus {
  directory:string;state:'EMPTY'|'CAPTURING'|'INTERRUPTED'|'SOURCE_RECEIVED'|'COMPLETE';kind?:FredDdpSourceKind;
  captureId?:string;captureSha256?:string;summary?:FredDdpCrosswalkModel['summary']|FredDdpPackageModel['summary'];
  request?:FredDdpAcquisitionRequest;startedAt?:string;files?:FredDdpFileDescriptor[];
  nextRequest:FredDdpOriginalSourceRequest|null;lastError:FredDdpAcquisitionError|null;lastResponse?:Record<string,unknown>|null;
}
export function normalizeFredDdpAcquisition(input:Partial<FredDdpAcquisitionInput>&{kind:FredDdpSourceKind}):FredDdpAcquisitionRequest;
export function requestFredDdpFile(input:{url:string;name?:string|null},options?:{fetchImpl?:typeof fetch;signal?:AbortSignal;maxBytes?:number}):Promise<FredDdpSourceFile>;
export function readFredDdpCrosswalkCapture(path:string):Promise<FredDdpCrosswalkSourceResult>;
export function readFredDdpPackageCapture(path:string):Promise<FredDdpPackageSourceResult>;
export function storeFredDdpCrosswalkCapture(directory:string,capture:FredDdpCrosswalkCapture):Promise<FredDdpCrosswalkSourceResult>;
export function storeFredDdpPackageCapture(directory:string,capture:FredDdpPackageCapture):Promise<FredDdpPackageSourceResult>;
export function captureFredDdpCrosswalk(input:FredDdpAcquisitionInput):Promise<FredDdpCrosswalkSourceResult>;
export function captureFredDdpPackage(input:FredDdpAcquisitionInput):Promise<FredDdpPackageSourceResult>;
export function inspectFredDdpAcquisition(input:{directory:string}):Promise<FredDdpAcquisitionStatus>;
