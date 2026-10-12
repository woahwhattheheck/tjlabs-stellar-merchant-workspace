import type { Buffer } from 'node:buffer';
import type { FredDdpReceiving } from './receiving.mjs';

export type FredDdpReceivingRenderer = 'FRED_DDP_RECEIVING_V1';
export interface FredDdpReceivingFile {
  path: 'ddp-receiving.json' | 'ddp-receiving.csv' | 'ddp-receiving.html';
  contentType: 'application/json' | 'text/csv' | 'text/html';
  bytes: number;
  sha256: string;
}
export interface FredDdpReceivingFileManifest {
  rendererVersion: FredDdpReceivingRenderer;
  files: FredDdpReceivingFile[];
}
export interface FredDdpPreparedReceivingFiles {
  rendererVersion: FredDdpReceivingRenderer;
  files: Array<FredDdpReceivingFile & { body: Buffer }>;
}
export declare const FRED_DDP_RECEIVING_RENDERER: FredDdpReceivingRenderer;
export declare const FRED_DDP_RECEIVING_FILE_LIMIT: number;
export declare const FRED_DDP_RECEIVING_MEMBERS: ReadonlyArray<Pick<FredDdpReceivingFile, 'path' | 'contentType'>>;
export declare function validateFredDdpReceivingFileManifest<T extends FredDdpReceivingFileManifest>(value: T): T;
export declare function createFredDdpReceivingFiles(receiving: FredDdpReceiving,
  options?: { rendererVersion?: FredDdpReceivingRenderer }): FredDdpPreparedReceivingFiles;
export declare function fredDdpReceivingFileManifest(prepared: FredDdpPreparedReceivingFiles): FredDdpReceivingFileManifest;
export declare function verifyFredDdpReceivingFiles(receiving: FredDdpReceiving,
  retained: FredDdpReceivingFileManifest): FredDdpPreparedReceivingFiles;

/** Produces each complete original member in order, retaining one buffer at a time. */
export declare function generateFredDdpReceivingFiles(receiving: FredDdpReceiving,
  options?: { rendererVersion?: FredDdpReceivingRenderer }): Generator<FredDdpReceivingFile & { body: Buffer }, void, unknown>;
/** Verifies the original complete members and returns their small descriptors. */
export declare function verifyFredDdpReceivingManifest(receiving: FredDdpReceiving,
  retained: FredDdpReceivingFileManifest): FredDdpReceivingFileManifest;
