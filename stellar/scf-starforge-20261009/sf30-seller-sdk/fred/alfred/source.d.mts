import type { FredAlfredCapture, FredAlfredModel, FredAlfredRecord, FredAlfredSelectionInput,
  FredAlfredSelection, FredAlfredRequest, FredAlfredTextSource, FredAlfredMetadataEdition } from './model.mjs';
export interface FredAlfredSourceResult {
  directory: string; capture: FredAlfredCapture; model: FredAlfredModel; reused: boolean;
}
export interface FredAlfredAcquisitionError {
  name: string; code: string; message: string; status: number | null; retryAfter: string | null;
}
export interface FredAlfredAcquisition {
  schema: 'stellar-forge.alfred-acquisition.v1'; selection: FredAlfredSelection; requestFingerprint: string;
  status: 'pending' | 'acquiring' | 'interrupted' | 'failed' | 'complete';
  completedSeries: string[]; responseCount: number; nextRequest: FredAlfredRequest | null;
  lastError: FredAlfredAcquisitionError | null; nextAllowedAt: string | null;
  attempts: { series: string; path: string; status: number; receivedAt: string; sha256: string }[];
  startedAt: string; updatedAt: string; captureSha256: string | null;
}
export declare function validateFredAlfredCapture(capture: FredAlfredCapture): FredAlfredModel;
export declare function sealFredAlfredCapture(selection: FredAlfredSelectionInput, records: FredAlfredRecord[]): FredAlfredCapture;
export declare function createFredAlfredFileResponse(input: { body: string; url: string; receivedAt: string }): FredAlfredTextSource;
export declare function adoptFredAlfredMetadata(capture: FredAlfredCapture, metadata: FredAlfredMetadataEdition[]): FredAlfredCapture;
export declare function readFredAlfredCapture(directory: string): Promise<FredAlfredSourceResult>;
export declare function storeFredAlfredCapture(directory: string, capture: FredAlfredCapture): Promise<FredAlfredSourceResult>;
export declare function inspectFredAlfredAcquisition(input: { directory: string }): Promise<FredAlfredAcquisition & { directory: string }>;
export declare function captureFredAlfred(input: {
  directory: string; selection: FredAlfredSelectionInput; metadata?: FredAlfredMetadataEdition[];
  fetchImpl?: typeof globalThis.fetch; signal?: AbortSignal;
  onProgress?: (value: FredAlfredAcquisition) => unknown | Promise<unknown>;
}): Promise<FredAlfredSourceResult>;
