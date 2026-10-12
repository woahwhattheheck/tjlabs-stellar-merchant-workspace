import type { FredReleaseCapture, FredReleaseModel, FredReleaseSelection, FredReleaseSelectionInput, FredReleaseRequest } from './model.mjs';
export { inspectFredReleaseCapture, validateFredReleaseCapture, sealFredReleaseCapture } from './model.mjs';
export declare const FRED_RELEASE_ACQUISITION: 'stellar-forge.fred-release-acquisition.v1';
export interface FredReleaseAcquisitionResult {
  directory: string; capture: FredReleaseCapture; model: FredReleaseModel; reused: boolean;
}
export interface FredReleaseAcquisitionProgress {
  responses: number; endpoint: FredReleaseRequest['endpoint']; series: string | null; releaseId: string | null; offset: number;
}
export interface FredReleaseAcquisitionError { code: string; status: number | null; at?: string; retryAt?: string | null }
export interface FredReleaseAcquisitionStatus {
  directory: string; state: 'EMPTY' | 'CAPTURING' | 'INTERRUPTED' | 'COMPLETE'; responses: number;
  selection?: FredReleaseSelection; captureSha256?: string; rowCount?: number; apiKeyEnv?: string; startedAt?: string;
  nextRequest: FredReleaseRequest | null; lastError: FredReleaseAcquisitionError | null;
  sourceError?: FredReleaseAcquisitionError | null;
}
export declare function readFredReleaseCapture(path: string): Promise<{ capture: FredReleaseCapture; model: FredReleaseModel }>;
export declare function storeFredReleaseCapture(directory: string, capture: FredReleaseCapture): Promise<FredReleaseAcquisitionResult>;
export declare function inspectFredReleaseAcquisition(input: { directory: string }): Promise<FredReleaseAcquisitionStatus>;
export declare function captureFredReleases(input: {
  directory: string; selection: FredReleaseSelectionInput; apiKeyEnv?: string; environment?: Record<string, string | undefined>;
  signal?: AbortSignal; fetchImpl?: typeof fetch;
  onProgress?: (progress: FredReleaseAcquisitionProgress) => void | Promise<void>;
}): Promise<FredReleaseAcquisitionResult>;
