// MIT. Release project SDK declarations; runtime functions live in ../project.mjs.
import type { normalizeFredReleaseSelection, inspectFredReleaseCapture, sealFredReleaseCapture } from './model.mjs';
import type { createFredReleaseWatch } from './watch.mjs';
import type { planFredReleaseCatchUp, pageFredReleasePlan } from './planner.mjs';

export type FredReleaseSelection = ReturnType<typeof normalizeFredReleaseSelection>;
export type FredReleaseCapture = ReturnType<typeof sealFredReleaseCapture>;
export type FredReleaseModel = ReturnType<typeof inspectFredReleaseCapture>;
export type FredReleaseWatch = ReturnType<typeof createFredReleaseWatch>;
export type FredReleasePlan = ReturnType<typeof planFredReleaseCatchUp>;
export type FredReleasePlanPage = ReturnType<typeof pageFredReleasePlan>;
export type FredReleasePlanSection = 'acquisitions' | 'calendarChanges' | 'vintageChanges' | 'events' | 'schedule';
export type FredPlannedObservationSelection = FredReleasePlan['acquisitions'][number]['selection'];
export type FredReleaseSeriesSummary = Omit<FredReleaseModel['series'][number], 'vintageDates' | 'originalMetadata'> & {
  vintageCount: number; latestVintageDate: string | null;
};
export interface FredReleaseCaptureSummary {
  id: string;
  selection: FredReleaseSelection;
  rowCount: number;
  series: FredReleaseSeriesSummary[];
  releaseCount: number;
  calendarRows: number;
  vintageRows: number;
  recordCount: number;
}
export interface FredReleasePlanSummary {
  id: string;
  watchId: string;
  beforeCaptureSha256: string | null;
  afterCaptureSha256: string;
  metadataAsOf: string;
  completedAsOf: string[];
  summary: FredReleasePlan['summary'];
  coverage: FredReleasePlan['coverage'];
}
export interface FredReleaseCatchUp {
  watchId: string;
  planId: string;
  asOf: string;
  captureId: string;
  selection: FredPlannedObservationSelection;
}
export interface FredReleaseProjectState {
  releaseCaptures?: FredReleaseCaptureSummary[];
  releaseWatches?: FredReleaseWatch[];
  releasePlans?: FredReleasePlanSummary[];
  releaseCatchUps?: FredReleaseCatchUp[];
}
export interface FredReleaseCaptureInventory {
  projectId: string; revision: number; captures: FredReleaseCaptureSummary[];
}
export interface FredReleaseWatchInventory {
  projectId: string; revision: number; watches: FredReleaseWatch[];
  plans: FredReleasePlanSummary[]; catchUps: FredReleaseCatchUp[];
}
export interface FredReleaseMutation {
  directory: string; id: string; expectedRevision: number;
}
export type FredReleaseOperationResult<T> = T & { revision: number; replayed?: boolean };
export type FredReleaseImportInput = FredReleaseMutation & (
  { capture: FredReleaseCapture; releaseCaptureId?: string } |
  { capture?: null; releaseCaptureId: string }
);
export interface FredReleaseSourceContext {
  signal?: AbortSignal;
  environment?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}
export interface FredReleaseAcquireInput extends FredReleaseMutation, FredReleaseSourceContext {
  /** May be omitted when continuing the original pending acquisition. */
  selection?: FredReleaseSelection;
}
export interface FredReleaseWatchInput extends FredReleaseMutation {
  name: string; series?: string[]; templateId?: string | null;
  observationStart: string; observationEnd?: 'as_of' | string; baselineAsOf: string;
  catchUp?: 'all_vintages' | 'latest_vintage'; pageSize?: number; maxRows?: number;
}
export interface FredReleasePlanInput {
  directory: string; watchId: string; beforeCaptureId?: string | null; afterCaptureId: string;
}
export interface FredReleasePlanPaging {
  section?: FredReleasePlanSection; offset?: number; limit?: number;
}
export interface FredReleasePlanPreview {
  projectId: string; revision: number; previewId: string; plan: FredReleasePlanPage;
}
export interface FredReleasePlanView {
  projectId: string; revision: number; plan: FredReleasePlanPage; catchUps: FredReleaseCatchUp[];
}
export interface FredReleasePlanFile {
  body: Uint8Array; bytes: number; sha256: string; contentType: 'application/json';
  path: 'fred-release-plan.json'; planId: string; watchId: string;
}
export type FredReleaseCaptureResult = FredReleaseOperationResult<{
  releaseCaptureId: string; capture: FredReleaseCaptureSummary; acquisitionId?: string;
}>;
export type FredReleaseWatchResult = FredReleaseOperationResult<{ watchId: string; watch: FredReleaseWatch }>;
export type FredReleasePlanResult = FredReleaseOperationResult<{ planId: string; plan: FredReleasePlanSummary }>;
export type FredPlannedVintageResult = FredReleaseOperationResult<{
  captureId: string; rowCount: number; missing: number;
  watchId: string; planId: string; asOf: string; selection: FredPlannedObservationSelection;
  catchUp: FredReleaseCatchUp; acquisitionId: string; reusedCapture: boolean;
}>;
export interface FredReleaseProjectApi {
  fredReleaseCaptureDirectory(directory: string, releaseCaptureId: string): string;
  listFredReleaseCaptures(input: { directory: string }): Promise<FredReleaseCaptureInventory>;
  getFredReleaseCapture(input: { directory: string; releaseCaptureId: string }): Promise<FredReleaseCapture>;
  importFredReleaseCapture(input: FredReleaseImportInput): Promise<FredReleaseCaptureResult>;
  acquireFredReleaseCapture(input: FredReleaseAcquireInput): Promise<FredReleaseCaptureResult>;
  listFredReleaseWatches(input: { directory: string }): Promise<FredReleaseWatchInventory>;
  saveFredReleaseWatch(input: FredReleaseWatchInput): Promise<FredReleaseWatchResult>;
  previewFredReleasePlan(input: FredReleasePlanInput & FredReleasePlanPaging): Promise<FredReleasePlanPreview>;
  saveFredReleasePlan(input: FredReleasePlanInput & FredReleaseMutation & { previewId: string }): Promise<FredReleasePlanResult>;
  getFredReleasePlan(input: { directory: string; planId: string } & FredReleasePlanPaging): Promise<FredReleasePlanView>;
  downloadFredReleasePlan(input: { directory: string; planId: string }): Promise<FredReleasePlanFile>;
  acquireFredPlannedVintage(input: FredReleaseMutation & FredReleaseSourceContext & {
    planId: string; asOf: string;
  }): Promise<FredPlannedVintageResult>;
}
export declare const fredReleaseCaptureDirectory: FredReleaseProjectApi['fredReleaseCaptureDirectory'];
export declare const listFredReleaseCaptures: FredReleaseProjectApi['listFredReleaseCaptures'];
export declare const getFredReleaseCapture: FredReleaseProjectApi['getFredReleaseCapture'];
export declare const importFredReleaseCapture: FredReleaseProjectApi['importFredReleaseCapture'];
export declare const acquireFredReleaseCapture: FredReleaseProjectApi['acquireFredReleaseCapture'];
export declare const listFredReleaseWatches: FredReleaseProjectApi['listFredReleaseWatches'];
export declare const saveFredReleaseWatch: FredReleaseProjectApi['saveFredReleaseWatch'];
export declare const previewFredReleasePlan: FredReleaseProjectApi['previewFredReleasePlan'];
export declare const saveFredReleasePlan: FredReleaseProjectApi['saveFredReleasePlan'];
export declare const getFredReleasePlan: FredReleaseProjectApi['getFredReleasePlan'];
export declare const downloadFredReleasePlan: FredReleaseProjectApi['downloadFredReleasePlan'];
export declare const acquireFredPlannedVintage: FredReleaseProjectApi['acquireFredPlannedVintage'];

/** Existing original state, economic captures, publication plans and analyst files are carried unchanged. */
export interface FredReleaseProjectBundleV4<TState = Record<string, unknown>, TCapture = unknown,
  TPublicationPlan = unknown, TBriefing = unknown> {
  schema: 'stellar-forge.fred-project-bundle.v4';
  state: TState & FredReleaseProjectState;
  captures: TCapture[];
  publicationPlans: TPublicationPlan[];
  /** Empty is valid for a series-only release watch. */
  briefings: TBriefing[];
  releaseCaptures: FredReleaseCapture[];
  releasePlans: FredReleasePlan[];
  bundleSha256: string;
}
