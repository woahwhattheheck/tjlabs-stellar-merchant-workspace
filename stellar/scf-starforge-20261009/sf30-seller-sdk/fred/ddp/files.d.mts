/// <reference types="node" />
import type { Buffer } from 'node:buffer';
export type FredDdpSourceProvenance =
  | { kind:'file'; receivedAt:string }
  | { kind:'http'; receivedAt:string; url:string; finalUrl:string; status:200; headers:Record<string,string> };
export interface FredDdpSourceFile {
  name:string; mediaType:string; bytes:number; sha256:string; base64:string; provenance:FredDdpSourceProvenance;
}
export type FredDdpFileDescriptor = Omit<FredDdpSourceFile,'base64'>;
export const MAX_DDP_FILE_BYTES:number;
export const MAX_DDP_CAPTURE_BYTES:number;
export const DDP_CROSSWALK_URL:string;
export const DDP_H15_ARCHIVE_URL:string;
export function normalizeFredDdpRelease(value:unknown):string;
export function sealFredDdpFile(input:{name:string;mediaType:string;bytes:Uint8Array;provenance:FredDdpSourceProvenance}):FredDdpSourceFile;
export function createFredDdpSourceFile(input:{name:string;mediaType?:string;content:Uint8Array;provenance:FredDdpSourceProvenance}):FredDdpSourceFile;
export function ddpHash(value:Uint8Array|string):string;
export function ddpDigest(value:unknown):string;
export function ddpFileName(value:unknown):string;
export function ddpBoardUrl(value:unknown):string;
export function ddpTimestamp(value:unknown):string;
export function ddpProvenance(value:unknown):FredDdpSourceProvenance;
export function fredDdpFileBytes(value:FredDdpSourceFile):Buffer;
export function validateFredDdpSourceFile(value:unknown):FredDdpSourceFile;
export function fredDdpFileText(value:FredDdpSourceFile):string;
export function fredDdpFileDescriptor(value:FredDdpSourceFile):FredDdpFileDescriptor;
