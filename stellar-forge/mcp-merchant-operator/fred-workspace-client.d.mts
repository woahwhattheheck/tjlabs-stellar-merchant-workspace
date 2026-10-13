/// <reference types="node" />
import type { FredDdpPublicationOperation, FredDdpPublicationInventory, FredDdpPublicationReportPage,
  FredDdpPublicationRowsPage, FredDdpPublicationRowSelection, FredDdpPublicationFileChunk, FredDdpPublicationFileSelection,
  FredDdpPublicationStart, FredDdpPublicationPage } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/ddp/published-workspace.mjs';
export type { FredDdpPublicationOperation, FredDdpPublicationInventory, FredDdpPublicationReportPage,
  FredDdpPublicationRowsPage, FredDdpPublicationRow, FredDdpPublicationFile, FredDdpPublicationFileChunk }
  from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/ddp/published-workspace.mjs';
import type { Buffer } from 'node:buffer';
import type { FredOperatingSource } from '../../stellar/scf-starforge-20261009/distribution/discovery/fred-operating-plan.mjs';
import type { OperatingPlan } from '../../stellar/scf-starforge-20261009/distribution/discovery/operating-plan.mjs';
export type { FredOperatingSource } from '../../stellar/scf-starforge-20261009/distribution/discovery/fred-operating-plan.mjs';
export type { FredOperatingArchiveResult, FredOperatingArchiveExportOptions, FredOperatingArchiveInspectOptions, FredOperatingArchiveReceiveOptions }
  from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/operating/archive.mjs';
import type { FredAlfredMetadataEdition } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/alfred/model.mjs';
export type { FredAlfredCapture, FredAlfredModel, FredAlfredSeries, FredAlfredRow,
  FredAlfredMetadataEdition, FredAlfredMetadataCoverage } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/alfred/model.mjs';
import type { FredBriefingSelection, FredBriefingPage } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/briefing/model.mjs';
export type { FredBriefingSelection, FredBriefingPage, FredBriefingComparison, FredBriefingModel, FredBriefingReport, FredBriefingExpandedMeasure } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/briefing/model.mjs';

import type {
  FredBriefingTemplate, FredBriefingTemplateWindow, FredBriefingMaterialization,
  FredBriefingChangesPage, FredBriefingSuccessorRecord,
} from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/briefing/templates.mjs';
export type {
  FredBriefingTemplate, FredBriefingTemplateWindow, FredBriefingTemplateAnchor,
  FredBriefingMaterialization, FredBriefingSourceCoverage, FredBriefingMeaningChange,
  FredBriefingChangeRow, FredBriefingChangeKind, FredBriefingChanges, FredBriefingChangesPage,
  FredBriefingSuccessorRecord,
} from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/briefing/templates.mjs';

import type {
  FredReleaseSelectionInput, FredReleaseSelection, FredReleaseCapture, FredReleaseSeries,
  FredRelease, FredReleaseCalendarRow, FredReleaseVintageRow, FredReleaseSourceContext,
} from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/releases/model.mjs';
import type { FredReleasePlan, FredReleasePlanPage, FredReleasePlanSection } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/releases/planner.mjs';
import type {
  FredReleaseProjectState, FredReleaseCaptureInventory, FredReleaseWatchInventory, FredReleaseCaptureResult,
  FredReleaseWatchResult, FredReleasePlanResult, FredPlannedVintageResult, FredReleasePlanPreview,
  FredReleasePlanView, FredReleasePlanPaging, FredReleaseWatchInput as NativeFredReleaseWatchInput,
  FredReleasePlanInput as NativeFredReleasePlanInput,
} from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/releases/project-types.mjs';
export { inspectFredReleaseCapture } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/releases/model.mjs';
export type {
  FredReleaseSelectionInput, FredReleaseSelection, FredReleaseCapture, FredReleaseModel, FredReleaseRequest,
  FredReleaseReceipt, FredOriginalRelease, FredOriginalReleaseDate, FredReleaseCalendarRow, FredReleaseVintageRow,
  FredReleaseSeries, FredRelease, FredReleaseFlowModel, FredReleaseSourceContext, FredReleaseSourcePage,
} from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/releases/model.mjs';
export type { FredReleaseWatch, FredReleaseWatchId, FredReleaseWatchInput, FredReleaseCatchUpPolicy
} from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/releases/watch.mjs';
export type {
  FredReleasePlan, FredReleasePlanId, FredReleasePlanPage, FredReleasePlanSection, FredReleasePlanSummary,
  FredReleaseInterval, FredReleaseCoverage, FredCalendarChangeKind, FredReleaseCalendarChange,
  FredVintageChangeKind, FredReleaseVintageChange, FredReleaseAcquisitionReason, FredReleaseEvent,
  FredReleaseObservationSelection, FredReleaseAcquisition, FredReleaseMeaningChange, FredReleaseSourceChange,
  FredReleaseScheduleRow,
} from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/releases/planner.mjs';
export type {
  FredReleaseProjectState, FredReleaseSeriesSummary, FredReleaseCaptureSummary,
  FredReleasePlanSummary as FredReleasePlanRecord, FredReleaseCatchUp,
  FredReleaseCaptureInventory, FredReleaseWatchInventory, FredReleaseCaptureResult, FredReleaseWatchResult,
  FredReleasePlanResult, FredPlannedVintageResult, FredReleasePlanPreview, FredReleasePlanView,
  FredReleasePlanPaging, FredReleaseProjectBundleV4,
} from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/releases/project-types.mjs';

import type { FredDdpCrosswalkCapture, FredDdpCrosswalkPage } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/ddp/crosswalk.mjs';
import type { FredDdpPackageCapture, FredDdpPackagePage } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/ddp/package.mjs';
import type { FredDdpMigrationPlan, FredDdpMigrationPlanPage } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/ddp/migration.mjs';
import type { FredDdpReceiving, FredDdpReceivingPage } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/ddp/receiving.mjs';
import type {
  FredDdpCrosswalkSummary, FredDdpPackageSummary, FredDdpMigrationSummary, FredDdpReceivingSummary,
  FredDdpProjectInventory, FredDdpMigrationInput as NativeFredDdpMigrationInput, FredDdpMigrationPreview,
  FredDdpMigrationView, FredDdpReceivingView, FredDdpMigrationSaveResult, FredDdpMigrationAcquireResult,
} from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/ddp/project-types.mjs';
export { inspectFredDdpCrosswalk } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/ddp/crosswalk.mjs';
export { inspectFredDdpPackage } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/ddp/package.mjs';
export type { FredDdpSourceFile } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/ddp/files.mjs';
export type { FredDdpCrosswalkCapture, FredDdpCrosswalkModel, FredDdpCrosswalkPage
} from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/ddp/crosswalk.mjs';
export type { FredDdpPackageCapture, FredDdpPackageModel, FredDdpPackagePage
} from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/ddp/package.mjs';
export type { FredDdpMigrationPlan, FredDdpMigrationPlanPage
} from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/ddp/migration.mjs';
export type { FredDdpReceiving, FredDdpReceivingPage, FredDdpReceivingRow
} from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/ddp/receiving.mjs';
export type {
  FredDdpSourceSummary, FredDdpCrosswalkSummary, FredDdpPackageSummary, FredDdpMigrationSummary, FredDdpReceivingSummary,
  FredDdpProjectInventory, FredDdpMigrationPreview, FredDdpMigrationView, FredDdpReceivingView,
  FredDdpSourceImportResult, FredDdpMigrationSaveResult, FredDdpMigrationAcquireResult, FredDdpProjectApi,
} from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/ddp/project-types.mjs';

import type { QcewProfile, QcewEdition, QcewSourceSummary } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/qcew/index.mjs';
export type { QcewCapture, QcewProfile, QcewEdition, QcewReport, QcewFilePackage, QcewSourceSummary } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/fred/qcew/index.mjs';
export interface FredQcewProjectState {
  schema: 'stellar-forge.fred-qcew-project.v1';
  captures: Array<{ id: string; captureSha256: string; summary: QcewSourceSummary }>;
  profiles: QcewProfile[]; editions: QcewEdition[];
  selectedCapture: string | null; selectedProfile: string | null; selectedEdition: string | null;
}
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };
export type NativeRecord = JsonObject & { id: string };
export interface FredSourceInput { path: string; kind: 'public-table' | 'capture' | 'release-capture' | 'ddp-crosswalk' | 'ddp-package' | 'alfred-metadata' | 'operating-archive' | 'operating-plan' | 'research-source' | 'research-catalogue'; label?: string; sha256?: string }
export interface FredMerchantProfile { label?: string; origin: string; path?: string; payment: JsonObject }
export interface FredWorkspaceOptions {
  label?: string; projectId?: string; expectedBindingSha256?: string;
  timeoutMs?: number; maxResponseBytes?: number; maxDdpResponseBytes?: number;
  inputs?: Record<string, FredSourceInput>; merchantProfiles?: Record<string, FredMerchantProfile>;
}
export type FredWorkspaceDefinition = FredWorkspaceOptions & (
  { url: string | FredStartup; consoleUrlFile?: never; consoleUrlEnv?: never } |
  { consoleUrlFile: string; url?: never; consoleUrlEnv?: never } |
  { consoleUrlEnv: string; url?: never; consoleUrlFile?: never }
);
export interface FredWorkspaceConfiguration {
  schema: 'stellar-forge.fred-workspace-connection.v1'; path: string;
  workspaces: Record<string, FredWorkspaceDefinition>;
}
export interface FredBinding {
  schema: 'stellar-forge.fred-workspace-binding.v1';
  directory: string; projectId: string; createdAt: string;
  buyerConfig: { path: string; settingsSha256: string } | null;
  facilitator: string | null; allowLocalFacilitator: boolean; merchantPort: number; sha256: string;
}
export interface FredStartup {
  schema: 'stellar-forge.fred-workspace-startup.v1'; state: 'LISTENING';
  binding: FredBinding; instanceId: string; startedAt: string; buyerConfigured: boolean; url?: string;
}
export interface FredProject extends FredReleaseProjectState {
  schema: 'stellar-forge.fred-project.v1'; id: string; title: string; apiKeyEnv: string;
  selection: JsonObject; revision: number; createdAt: string; selectedCapture: string | null;
  captures: NativeRecord[]; reviews: NativeRecord[]; publications: NativeRecord[]; operations: NativeRecord[];
  pending: JsonObject | null; acquisition?: JsonObject | null;
  briefingTemplates?: FredBriefingTemplate[]; briefingSuccessors?: FredBriefingSuccessorRecord[];
  qcew?: FredQcewProjectState;
  research?: FredResearchCatalogue;
  ddpCrosswalks?: FredDdpCrosswalkSummary[]; ddpPackages?: FredDdpPackageSummary[];
  ddpMigrations?: FredDdpMigrationSummary[]; ddpReceivings?: FredDdpReceivingSummary[];
}
export interface FredState { project: FredProject; merchant: JsonObject | null; busy: string | null; buyerConfigured: boolean }
export interface FredClientMetadata {
  projectId: string | null; connected: boolean; closed: boolean; bindingSha256: string | null;
  instanceId: string | null; timeoutMs: number; maxResponseBytes: number; maxDdpResponseBytes: number; hostOwnership: 'ORIGINAL_FRED_WORKSPACE';
}
export interface FredOperation {
  projectId: string; revision: number; busy: string | null; operation: NativeRecord | null;
  pending: JsonObject | null; acquisition: JsonObject | null; observationTimedOut?: boolean;
}
export interface FredObservedPage {
  captureId: string; series: Json[]; total: number; offset: number; limit: number; rows: JsonObject[]; nextOffset: number | null;
}
export interface FredComparisonPage {
  total: number; offset: number; limit: number; changes: JsonObject[]; nextOffset: number | null; [key: string]: unknown;
}
export interface FredPublication {
  edition: JsonObject; plan: JsonObject; offers: JsonObject[];
  requests: Array<{ intentId: string; url: string; file: string | null; purchaseSha256: string }>;
}
export interface FredRevisionResult { revision: number; replayed?: boolean }
export interface FredConfiguredResult extends FredRevisionResult { selection: JsonObject }
export interface FredCaptureResult extends FredRevisionResult { captureId: string; rowCount: number; missing: number }
export interface FredCombinedResult extends FredCaptureResult { originalCaptures: string[] }
export interface FredSelectedResult extends FredRevisionResult { captureId: string }
export interface FredReviewedResult extends FredSelectedResult { reviewId: string; briefing?: FredSavedBriefing }
export interface FredSavedBriefing { reportId: string; manifestSha256: string; files: FredFileMetadata[] }
export interface FredBriefingManifest {
  schema: 'stellar-forge.fred-briefing-files.v1'; captureId: string; reviewId: string; reportId: string;
  calculationVersion: 'FRED_EXACT_PERIOD_V1'; rendererVersion: 'FRED_OFFLINE_REPORT_V1' | 'FRED_OFFLINE_REPORT_V2';
  files: FredFileMetadata[]; manifestSha256: string;
}
export interface FredSavedBriefingPage extends FredBriefingPage { reportId: string; reviewId: string; manifest: FredBriefingManifest; files: FredFileMetadata[] }
export interface FredPublishedResult extends FredRevisionResult {
  publicationId: string; reviewId: string; captureId: string; snapshot: string;
  editionId: string; resource: string; publicOrigin: string; briefing?: Pick<FredSavedBriefing, 'reportId' | 'manifestSha256'>;
}
export interface FredFileMetadata { path: string; bytes: number; sha256: string; contentType: string; role: string }
export interface FredAdvertisedFile extends FredFileMetadata { resource: string }
export interface FredMerchantRuntime {
  publicationId: string; url: string; mode: string; editionId: string; snapshot: string; resource: string;
}
export interface FredPreparedPurchase {
  schema: 'stellar-forge.fred-purchase.v1'; editionId: string; captureSha256: string; snapshot: string;
  planSha256: string; intentId: string; url: string; file: string | null; previous: JsonObject | null;
  expected: FredAdvertisedFile | null; configSha256: string; config: JsonObject; purchaseSha256: string;
}
export interface FredDeliveredPurchase {
  state: 'DELIVERED'; intentId: string; editionId: string; bytes: number; sha256: string;
  metadata: JsonObject & { snapshot?: string; nextCursor?: string | null; path?: string; contentType?: string };
  page?: JsonObject;
}
export interface FredPendingPurchase {
  state: 'PREPARED_NOT_STARTED' | 'NATIVE_PREPARATION_INCOMPLETE' | 'AWAITING_NATIVE_RESULT';
  intentId: string; editionId?: string;
}
export type FredPurchaseStatus = FredDeliveredPurchase | FredPendingPurchase;
export interface FredJournalInput { id: string; expectedRevision: number }
export interface FredSelectionInput extends FredJournalInput { selection: JsonObject }
export interface FredImportInput extends FredJournalInput { capture: JsonObject }
export interface FredCombineInput extends FredJournalInput { captureIds: string[] }
export interface FredCaptureInput extends FredJournalInput { captureId: string }
export interface FredReviewInput extends FredCaptureInput { policy?: JsonObject; note?: string; briefing?: FredBriefingSelection | null }
export interface FredPublishInput extends FredJournalInput { reviewId: string; origin: string; path?: string; payment: JsonObject }
export interface FredAbandonInput extends FredJournalInput { pendingId: string }
export interface FredPublicationInput { publicationId: string }
export interface FredIntentInput extends FredPublicationInput { intentId: string }
export interface FredPrepareInput extends FredIntentInput {
  query?: string; file?: string | null; previous?: JsonObject | null; acceptIndex?: number;
}
export interface FredBriefingTemplateInventory {
  projectId: string; revision: number; templates: FredBriefingTemplate[]; successors: FredBriefingSuccessorRecord[];
}
export interface FredBriefingTemplateSaveInput extends FredJournalInput {
  reviewId: string; name?: string; window?: Partial<FredBriefingTemplateWindow>; previousTemplateId?: string | null;
}
export interface FredBriefingTemplateSaveResult extends FredRevisionResult {
  templateId: string; template: FredBriefingTemplate;
}
export interface FredBriefingSuccessorSelection {
  templateId: string; captureId: string; anchorDate?: string | null; baselineReviewId?: string | null;
  previousSuccessorId?: string | null; note?: string;
}
export interface FredBriefingSuccessorPageOptions { offset?: number; limit?: number; changesOnly?: boolean }
export interface FredBriefingSuccessorPreview {
  previewId: string; template: FredBriefingTemplate; materialization: FredBriefingMaterialization;
  baselineReviewId: string; previousSuccessorId: string | null; reviewId: string;
  briefing: FredBriefingPage; comparison: FredBriefingChangesPage;
}
export interface FredBriefingSuccessorSaveInput extends FredBriefingSuccessorSelection, FredJournalInput {
  previewId: string;
}
export interface FredBriefingSuccessorSaveResult extends FredRevisionResult {
  successorId: string; reviewId: string; captureId: string; templateId: string;
  briefing: FredSavedBriefing; summary: JsonObject;
}
export interface FredBriefingSuccessorView {
  successor: FredBriefingSuccessorRecord; template: FredBriefingTemplate;
  materialization: FredBriefingMaterialization; comparison: FredBriefingChangesPage;
  briefing: { reviewId: string; reportId: string; manifest: FredBriefingManifest };
}

export interface FredReleaseCaptureSections {
  series: FredReleaseSeries; releases: FredRelease; calendar: FredReleaseCalendarRow; vintages: FredReleaseVintageRow;
}
export type FredReleaseCaptureSection = keyof FredReleaseCaptureSections;
export interface FredReleaseCapturePage<S extends FredReleaseCaptureSection = FredReleaseCaptureSection> {
  projectId: string; revision: number; releaseCaptureId: string; selection: FredReleaseSelection;
  source: FredReleaseSourceContext; counts: Record<FredReleaseCaptureSection, number>;
  section: S; total: number; offset: number; limit: number; nextOffset: number | null;
  items: Array<FredReleaseCaptureSections[S]>;
}
export type FredReleaseImportInput = FredJournalInput & (
  { capture: FredReleaseCapture; releaseCaptureId?: string } |
  { capture?: null; releaseCaptureId: string }
);
export interface FredReleaseAcquireInput extends FredJournalInput {
  /** Required for a new capture; omitted only to continue the same original pending operation. */
  selection?: FredReleaseSelectionInput;
}
export type FredReleaseWatchSaveInput = Omit<NativeFredReleaseWatchInput, 'directory'>;
export type FredReleasePlanSelection = Omit<NativeFredReleasePlanInput, 'directory'>;
export type FredReleasePlanSaveInput = FredReleasePlanSelection & FredJournalInput & { previewId: string };
export interface FredPlannedVintageInput extends FredJournalInput { planId: string; asOf: string }

export type FredReleasePlanPageFor<S extends FredReleasePlanSection> =
  Omit<FredReleasePlanPage, 'section' | 'rows'> & { section: S; rows: FredReleasePlan[S] };
export type FredReleasePlanPreviewFor<S extends FredReleasePlanSection> =
  Omit<FredReleasePlanPreview, 'plan'> & { plan: FredReleasePlanPageFor<S> };
export type FredReleasePlanViewFor<S extends FredReleasePlanSection> =
  Omit<FredReleasePlanView, 'plan'> & { plan: FredReleasePlanPageFor<S> };


export interface FredDdpPageInput { offset?: number; limit?: number }
export interface FredDdpCrosswalkView { projectId: string; revision: number; crosswalk: FredDdpCrosswalkPage }
export interface FredDdpPackageView { projectId: string; revision: number; package: FredDdpPackagePage }
export type FredDdpCrosswalkImportInput = FredJournalInput & (
  { capture: FredDdpCrosswalkCapture; crosswalkId?: string } |
  { capture?: null; crosswalkId: string }
);
export type FredDdpPackageImportInput = FredJournalInput & (
  { capture: FredDdpPackageCapture; packageId?: string } |
  { capture?: null; packageId: string }
);
export interface FredDdpCrosswalkImportResult extends FredRevisionResult {
  crosswalkId: string; source: FredDdpCrosswalkSummary;
}
export interface FredDdpPackageImportResult extends FredRevisionResult {
  packageId: string; source: FredDdpPackageSummary;
}
export interface FredDdpCrosswalkAcquireInput extends FredJournalInput { url?: string }
export interface FredDdpCrosswalkAcquireResult extends FredDdpCrosswalkImportResult {
  acquisitionId: string; url: string;
}
export type FredDdpMigrationInput = Omit<NativeFredDdpMigrationInput, 'directory'>;
export type FredDdpMigrationPreviewInput = FredDdpMigrationInput & FredDdpPageInput & {
  section?: 'series' | 'acquisitions' | 'mappings';
};
export type FredDdpMigrationSaveInput = FredDdpMigrationInput & FredJournalInput & { previewId: string };
export interface FredDdpMigrationAcquireInput extends FredJournalInput {
  migrationId: string; sourceMode?: 'API_VINTAGE' | 'ALFRED_VINTAGE';
  metadata?: FredAlfredMetadataEdition[]; metadataSha256?: string;
}
export interface FredDdpMigrationAcquireHostInput extends FredJournalInput {
  migrationId: string; sourceMode?: 'API_VINTAGE' | 'ALFRED_VINTAGE';
  metadataInput?: string; metadataFileSha256?: string; metadataSha256?: string;
}
export interface FredDdpReceivingInput extends FredDdpPageInput {
  receivingId: string; seriesId?: string | null; changesOnly?: boolean;
}

export interface FredRequestOptions { signal?: AbortSignal }
export interface FredFileOptions extends FredRequestOptions { expectedSha256?: string }
export type FredFileSelection =
  { kind: 'research-source'; snapshotId: string; expectedRevision?: number } |
  { kind: 'research-catalogue'; expectedRevision?: number } |
  { kind: 'research-entry'; entryId: string; expectedRevision?: number } |
  { kind: 'research-product'; productId: string; editionId?: string; expectedRevision?: number } |
  { kind: 'source'; captureId: string } |
  { kind: 'release-source'; releaseCaptureId: string } |
  { kind: 'release-plan'; planId: string } |
  { kind: 'ddp-crosswalk'; crosswalkId: string } |
  { kind: 'ddp-package'; packageId: string } |
  { kind: 'ddp-migration'; migrationId: string } |
  { kind: 'ddp-receiving'; receivingId: string; format: 'html' | 'csv' | 'json' } |
  { kind: 'comparison'; before: string; after: string } |
  { kind: 'project' } |
  { kind: 'briefing'; reviewId: string; format: 'html' | 'csv' | 'json' | 'manifest' } |
  { kind: 'briefing-successor'; successorId: string; format: 'html' | 'csv' | 'json' } |
  { kind: 'customer'; publicationId: string; intentId: string };
export interface FredBundleIdentity {
  schema: 'stellar-forge.fred-project-bundle.v1' | 'stellar-forge.fred-project-bundle.v2' | 'stellar-forge.fred-project-bundle.v3' | 'stellar-forge.fred-project-bundle.v4' | 'stellar-forge.fred-project-bundle.v5' | 'stellar-forge.fred-project-bundle.v6' | 'stellar-forge.fred-project-bundle.v7'; projectId: string; revision: number;
  bundleSha256: string; captures: number; publications: number; briefings?: number; templates?: number; successors?: number;
  releaseCaptures?: number; releaseWatches?: number; releasePlans?: number; releaseCatchUps?: number;
  ddpCrosswalks?: number; ddpPackages?: number; ddpMigrations?: number; ddpReceivings?: number;
  qcew?: { captures: number; profiles: number; editions: number };
  research?: { entries: number; sources: number; reviews: number; products: number };
}
export interface FredDownloadedFile {
  name: string; type: string; bytes: Buffer; sha256: string; status: number; projectId: string; bundle?: FredBundleIdentity;
  releaseCaptureId?: string; planId?: string;
  crosswalkId?: string; packageId?: string; migrationId?: string; receivingId?: string;
}
export interface FredSavedFile {
  path: string; name: string; type: string; bytes: number; sha256: string; projectId: string; reused: boolean; bundle?: FredBundleIdentity;
  releaseCaptureId?: string; planId?: string;
  crosswalkId?: string; packageId?: string; migrationId?: string; receivingId?: string;
}
export interface FredClientRuntime { environment?: Record<string, string | undefined>; fetchImpl?: typeof fetch }

export declare const FRED_WORKSPACE_CONNECTION_SCHEMA: 'stellar-forge.fred-workspace-connection.v1';
export declare const FRED_CLIENT_MAX_BYTES: number;
export declare const FRED_CLIENT_MAX_REQUEST_BYTES: number;
export declare const FRED_DDP_MAX_SOURCE_BYTES: number;
export declare const FRED_DDP_MAX_PROJECT_BYTES: number;
export declare function fredDigest(bytes: string | Uint8Array): string;
export declare function canonicalFredJSON(value: Json): string;
export declare class FredWorkspaceError extends Error {
  code: string; status?: number; ambiguous?: boolean; operationId?: string; projectId?: string;
  responseReceived?: boolean; responseBytes?: number; responseSha256?: string; retryAt?: string; inspectOriginalOperation?: boolean;
  constructor(code: string, message: string, details?: Record<string, unknown>);
}
export declare function readFredHostFile(path: string, maximum?: number,
  options?: { privateFile?: boolean; expectedSha256?: string }): Promise<Buffer>;
export declare function readFredWorkspaceConfiguration(path: string): Promise<FredWorkspaceConfiguration>;

export interface FredOperatingArchiveFile { path:'fred-operating-handover.tar.gz';bytes:number;sha256:string }
export interface FredOperatingHandoverResult {
  archive:FredOperatingArchiveFile;sourceId:string;
  sourceFile:{path:string;bytes:number;sha256:string};manifestFile:{path:string;bytes:number;sha256:string};
  sourceProject:FredOperatingSource['project'];inventoryCounts:Record<string,number>;
  publishedCount:number;completePublishedCount:number;
  plan:null|{id:string;title:string;revision:number};projectDirectory:string|null;
}
export interface FredOperatingHandover {
  projectId:string;id:string;kind:'EXPORT'|'IMPORT';
  state:'EXPORTING'|'UPLOADING'|'INSPECTING'|'INSPECTED'|'RECEIVING'|'COMPLETE'|'FAILED'|'INTERRUPTED';
  phase:'export'|'upload'|'inspect'|'receive';active:boolean;
  retryAction:null|'export'|'upload'|'inspect'|'receive';createdAt:string;updatedAt:string;
  error:null|{code:string;message:string};result:FredOperatingHandoverResult|null;
}
export interface FredOperatingHandoverInventory {
  projectId:string;total:number;offset:number;limit:number;nextOffset:number|null;items:FredOperatingHandover[];
}
export interface FredOperatingHandoverExport {
  id:string;expectedRevision?:number;capturedAt?:string;publicationIds?:string[]|null;plan?:OperatingPlan|null;
}
export interface FredOperatingHandoverDownload {
  projectId:string;id:string;sourceId:string;archive:FredOperatingArchiveFile;
  destination:string;bytes:number;sha256:string;reused:boolean;
}
export declare const FRED_OPERATING_ARCHIVE_MAX_BYTES:number;
/** Exact byte identity only; full archive/source inspection is the maintained native archive API. */
export declare function inspectFredOperatingArchiveFile(path:string,options?:{expectedSha256?:string;signal?:AbortSignal}):
  Promise<{archivePath:string;bytes:number;sha256:string}>;


/** The original Research catalogue stays inside the existing economic project. */
export interface FredResearchDefinition {
  entryId: string; title: string; publisher: string; url: string;
  kind: 'DATASET' | 'RESEARCH' | 'REPORT' | 'METHOD' | 'OTHER';
  topics?: string[]; geographies?: string[]; cadenceDays?: number | null; expectedRelease?: string | null;
  licence?: string; notes?: string; retired?: boolean;
}
export interface FredResearchRequirement {
  id: string; title: string; entryIds: string[]; topics?: string[]; geographies?: string[]; note?: string;
}
export interface FredResearchProductDefinition {
  productId: string; title: string; audience?: string; purpose?: string; format?: string; notes?: string;
  retired?: boolean; requirements: FredResearchRequirement[];
}
export interface FredResearchVersion<T> { id: string; definition: T; savedAt: string }
export interface FredResearchSource {
  schema: 'stellar-forge.research-source.v1'; id: string; entryId: string; definitionId: string;
  requestedUrl: string; finalUrl: string; retrievedAt: string; status: number;
  contentType: string; filename: string; bytes: number; sha256: string; mode: 'HTTP' | 'UPLOAD';
}
export interface FredResearchReview {
  id: string; entryId: string; definitionId: string; snapshotId: string; decision: 'ACCEPT' | 'NEEDS_WORK' | 'REJECT';
  reviewer: string; note: string; reviewedAt: string;
}
export interface FredResearchEdition {
  id: string; productId: string; definitionId: string; issuedAt: string; issuedBy: string; note: string;
  sources: Array<{ requirementId: string; entryId: string; definitionId: string; snapshotId: string; reviewId: string }>;
}
export interface FredResearchCatalogue {
  schema: 'stellar-forge.research-catalog.v1';
  entries: Array<{ id: string; currentId: string; versions: Array<FredResearchVersion<FredResearchDefinition>> }>;
  sources: FredResearchSource[]; reviews: FredResearchReview[];
  products: Array<{ id: string; currentId: string; versions: Array<FredResearchVersion<FredResearchProductDefinition>>; editions: FredResearchEdition[] }>;
}
export interface FredResearchSourceStatus {
  entryId: string; definitionId: string; title: string; publisher: string; url: string; kind: FredResearchDefinition['kind'];
  topics: string[]; geographies: string[]; retired: boolean; cadenceDays: number | null; expectedRelease: string | null;
  sourceId: string | null; retrievedAt: string | null; sourceBytes: number | null; httpStatus: number | null;
  reviewId: string | null; reviewer: string | null; reviewNote: string | null;
  status: 'RETIRED' | 'SOURCE_NEEDED' | 'SOURCE_UNAVAILABLE' | 'APPROVED' | 'REJECTED' | 'NEEDS_WORK' | 'REVIEW_NEEDED';
  due: boolean; dueAt: string | null;
}
export interface FredResearchCoverage extends FredResearchRequirement {
  selected: Array<(FredResearchSourceStatus & { topicMatch: boolean; geographyMatch: boolean; approved: boolean }) |
    { entryId: string; status: 'SOURCE_NOT_FOUND'; approved: false }>;
  state: 'COVERED' | 'GAP';
}
export interface FredResearchPageInput { offset?: number; limit?: number; expectedRevision?: number }
export interface FredResearchTimedPageInput extends FredResearchPageInput { asOf?: string }
export interface FredResearchPage<T> {
  projectId: string; revision: number; total: number; offset: number; limit: number; returned: number;
  nextOffset: number | null; items: T[];
}
export interface FredResearchCatalogueInput extends FredResearchTimedPageInput {
  query?: string; topic?: string; geography?: string; status?: FredResearchSourceStatus['status'] | ''; due?: boolean;
}
export interface FredResearchCataloguePage extends Omit<FredResearchPage<FredResearchSourceStatus>, 'items'> {
  asOf: string; rows: FredResearchSourceStatus[];
  counts: { entries: number; sources: number; reviews: number; products: number; bytes: number };
  products: 'merchant_fred_research_products'; taxonomy: 'merchant_fred_research_taxonomy';
}
export interface FredResearchProductSummary {
  productId: string; currentId: string; title: string; audience: string; format: string; retired: boolean;
  versions: number; editions: number; requirements: number;
}
export interface FredResearchEntryPage extends FredResearchPage<FredResearchVersion<FredResearchDefinition> | FredResearchSource | FredResearchReview> {
  entryId: string; currentId: string; asOf: string; current: FredResearchSourceStatus; section: 'versions' | 'sources' | 'reviews';
}
export interface FredResearchProductPage extends FredResearchPage<FredResearchVersion<FredResearchProductDefinition> | FredResearchEdition | FredResearchRequirement | FredResearchCoverage> {
  productId: string; currentId: string; asOf: string;
  definition: Omit<FredResearchProductDefinition, 'requirements'>;
  section: 'versions' | 'editions' | 'requirements' | 'coverage';
}
export type FredResearchAction = 'research-entry-save' | 'research-import' | 'research-source-acquire' |
  'research-source-upload' | 'research-review' | 'research-product-save' | 'research-product-issue';
export interface FredResearchSourceSelection { entryId: string; definitionId: string }
export interface FredResearchUpload extends FredJournalInput, FredResearchSourceSelection {
  filename: string; contentType?: string; bodyBase64: string; retrievedAt?: string;
}

export declare class FredWorkspaceClient {
  constructor(definition: FredWorkspaceDefinition, runtime?: FredClientRuntime);
  readonly metadata: FredClientMetadata;
  timeoutMs: number; maxResponseBytes: number; maxDdpResponseBytes: number;
  researchCatalogue(input?: FredResearchCatalogueInput, options?: FredRequestOptions): Promise<FredResearchCataloguePage>;
  researchTaxonomy(input: FredResearchPageInput & { section: 'topics' | 'geographies' }, options?: FredRequestOptions):
    Promise<FredResearchPage<string> & { section: 'topics' | 'geographies' }>;
  researchEntry(input: FredResearchTimedPageInput & { entryId: string; section: 'versions' | 'sources' | 'reviews' },
    options?: FredRequestOptions): Promise<FredResearchEntryPage>;
  researchProducts(input?: FredResearchPageInput & { query?: string }, options?: FredRequestOptions): Promise<FredResearchPage<FredResearchProductSummary>>;
  researchProduct(input: FredResearchTimedPageInput & { productId: string; section: 'versions' | 'editions' | 'requirements' | 'coverage' },
    options?: FredRequestOptions): Promise<FredResearchProductPage>;
  saveResearchEntry(input: FredJournalInput & { definition: FredResearchDefinition }, options?: FredRequestOptions):
    Promise<FredRevisionResult & { entryId: string; definitionId: string }>;
  importResearchCatalogue(input: FredJournalInput & ({ csv: string; definitions?: never } | { definitions: FredResearchDefinition[]; csv?: never }),
    options?: FredRequestOptions): Promise<FredRevisionResult & { entries: Array<{ entryId: string; definitionId: string }> }>;
  acquireResearchSource(input: FredJournalInput & FredResearchSourceSelection, options?: FredRequestOptions):
    Promise<FredRevisionResult & { source: FredResearchSource; status: 'REVIEW_NEEDED' | 'SOURCE_UNAVAILABLE' }>;
  uploadResearchSource(input: FredResearchUpload, options?: FredRequestOptions):
    Promise<FredRevisionResult & { source: FredResearchSource; status: 'REVIEW_NEEDED' | 'SOURCE_UNAVAILABLE' }>;
  reviewResearchSource(input: FredJournalInput & { snapshotId: string; decision: 'ACCEPT' | 'NEEDS_WORK' | 'REJECT'; reviewer: string; note: string },
    options?: FredRequestOptions): Promise<FredRevisionResult & { review: FredResearchReview }>;
  saveResearchProduct(input: FredJournalInput & { definition: FredResearchProductDefinition }, options?: FredRequestOptions):
    Promise<FredRevisionResult & { productId: string; definitionId: string; coverage: FredResearchCoverage[] }>;
  issueResearchProduct(input: FredJournalInput & { productId: string; issuedBy: string; note?: string }, options?: FredRequestOptions):
    Promise<FredRevisionResult & { edition: FredResearchEdition }>;
  resumeResearch(input: FredJournalInput & { action: FredResearchAction }, options?: FredRequestOptions): Promise<FredRevisionResult & JsonObject>;
  launch(options?: FredRequestOptions): Promise<FredStartup>;
  state(options?: FredRequestOptions): Promise<FredState>;
  operation(id: string, options?: FredRequestOptions): Promise<FredOperation>;
  observations(input: { captureId: string; series?: string; offset?: number }, options?: FredRequestOptions): Promise<FredObservedPage>;
  compare(input: { before: string; after: string; offset?: number }, options?: FredRequestOptions): Promise<FredComparisonPage>;
  previewBriefing(input: { captureId: string; briefing: FredBriefingSelection; offset?: number }, options?: FredRequestOptions): Promise<FredBriefingPage & { previewId: string }>;
  briefing(input: { reviewId: string; offset?: number }, options?: FredRequestOptions): Promise<FredSavedBriefingPage>;
  briefingTemplates(options?: FredRequestOptions): Promise<FredBriefingTemplateInventory>;
  saveBriefingTemplate(input: FredBriefingTemplateSaveInput, options?: FredRequestOptions): Promise<FredBriefingTemplateSaveResult>;
  previewBriefingSuccessor(input: FredBriefingSuccessorSelection & FredBriefingSuccessorPageOptions,
    options?: FredRequestOptions): Promise<FredBriefingSuccessorPreview>;
  saveBriefingSuccessor(input: FredBriefingSuccessorSaveInput, options?: FredRequestOptions): Promise<FredBriefingSuccessorSaveResult>;
  briefingSuccessor(input: { successorId: string } & FredBriefingSuccessorPageOptions,
    options?: FredRequestOptions): Promise<FredBriefingSuccessorView>;
  releaseCaptures(options?: FredRequestOptions): Promise<FredReleaseCaptureInventory>;
  releaseWatches(options?: FredRequestOptions): Promise<FredReleaseWatchInventory>;
  releaseCapture<S extends FredReleaseCaptureSection = 'series'>(input: {
    releaseCaptureId: string; section?: S; offset?: number; limit?: number;
  }, options?: FredRequestOptions): Promise<FredReleaseCapturePage<S>>;
  importReleaseCapture(input: FredReleaseImportInput, options?: FredRequestOptions): Promise<FredReleaseCaptureResult>;
  acquireReleaseCapture(input: FredReleaseAcquireInput, options?: FredRequestOptions): Promise<FredReleaseCaptureResult>;
  saveReleaseWatch(input: FredReleaseWatchSaveInput, options?: FredRequestOptions): Promise<FredReleaseWatchResult>;
  previewReleasePlan<S extends FredReleasePlanSection = 'acquisitions'>(input: FredReleasePlanSelection &
    Omit<FredReleasePlanPaging, 'section'> & { section?: S }, options?: FredRequestOptions): Promise<FredReleasePlanPreviewFor<S>>;
  saveReleasePlan(input: FredReleasePlanSaveInput, options?: FredRequestOptions): Promise<FredReleasePlanResult>;
  releasePlan<S extends FredReleasePlanSection = 'acquisitions'>(input: { planId: string; section?: S } &
    Omit<FredReleasePlanPaging, 'section'>, options?: FredRequestOptions): Promise<FredReleasePlanViewFor<S>>;
  acquirePlannedVintage(input: FredPlannedVintageInput, options?: FredRequestOptions): Promise<FredPlannedVintageResult>;
  publishedOperations(input?: FredDdpPublicationPage, options?: FredRequestOptions): Promise<FredDdpPublicationInventory>;
  publishedOperation(input: { id: string }, options?: FredRequestOptions): Promise<FredDdpPublicationOperation>;
  startPublishedOperation(input: Pick<FredDdpPublicationStart, 'id' | 'expectedRevision' | 'migrationId'>,
    options?: FredRequestOptions): Promise<FredDdpPublicationOperation>;
  publishedReport(input: { id: string; query?: string } & FredDdpPublicationPage, options?: FredRequestOptions): Promise<FredDdpPublicationReportPage>;
  publishedRows(input: Omit<FredDdpPublicationRowSelection, 'directory'>, options?: FredRequestOptions): Promise<FredDdpPublicationRowsPage>;
  publishedFileChunk(input: Omit<FredDdpPublicationFileSelection, 'directory'> & FredDdpPublicationPage,
    options?: FredRequestOptions): Promise<FredDdpPublicationFileChunk>;
  downloadPublishedFile(input: Omit<FredDdpPublicationFileSelection, 'directory'>, destination: string,
    options?: FredRequestOptions): Promise<{ projectId: string; operationId: string; destination: string; name: string; bytes: number; sha256: string; contentType: string }>;
  operatingHandovers(input?:{offset?:number;limit?:number},options?:FredRequestOptions):Promise<FredOperatingHandoverInventory>;
  operatingHandover(input:{id:string},options?:FredRequestOptions):Promise<FredOperatingHandover>;
  operatingHandoverSource(input:{id:string},options?:FredRequestOptions):Promise<FredOperatingSource>;
  operatingCurrentPlan(options?:FredRequestOptions):Promise<{projectId:string;plan:OperatingPlan|null}>;
  operatingHandoverPlan(input:{id:string},options?:FredRequestOptions):Promise<{projectId:string;id:string;plan:OperatingPlan|null}>;
  exportOperatingHandover(input:FredOperatingHandoverExport,options?:FredRequestOptions):Promise<FredOperatingHandover>;
  uploadOperatingHandover(input:{id:string;archivePath:string;expectedSha256?:string},options?:FredRequestOptions):Promise<FredOperatingHandover>;
  inspectOperatingHandover(input:{id:string},options?:FredRequestOptions):Promise<FredOperatingHandover>;
  receiveOperatingHandover(input:{id:string},options?:FredRequestOptions):Promise<FredOperatingHandover>;
  openOperatingHandover(input:{id:string},options?:FredRequestOptions):Promise<{projectId:string;id:string;startup:FredStartup}>;
  downloadOperatingHandover(input:{id:string;expectedSha256:string},destination:string,options?:FredRequestOptions):Promise<FredOperatingHandoverDownload>;
  ddpSources(options?: FredRequestOptions): Promise<FredDdpProjectInventory>;
  ddpCrosswalk(input: FredDdpPageInput & { crosswalkId: string; release?: string | null; query?: string },
    options?: FredRequestOptions): Promise<FredDdpCrosswalkView>;
  importDdpCrosswalk(input: FredDdpCrosswalkImportInput, options?: FredRequestOptions): Promise<FredDdpCrosswalkImportResult>;
  acquireDdpCrosswalk(input: FredDdpCrosswalkAcquireInput, options?: FredRequestOptions): Promise<FredDdpCrosswalkAcquireResult>;
  ddpPackage(input: FredDdpPageInput & { packageId: string; section?: 'series' | 'observations';
    seriesId?: string | null; frequency?: string | null; query?: string },
    options?: FredRequestOptions): Promise<FredDdpPackageView>;
  importDdpPackage(input: FredDdpPackageImportInput, options?: FredRequestOptions): Promise<FredDdpPackageImportResult>;
  previewDdpMigration(input: FredDdpMigrationPreviewInput, options?: FredRequestOptions): Promise<FredDdpMigrationPreview>;
  saveDdpMigration(input: FredDdpMigrationSaveInput, options?: FredRequestOptions): Promise<FredDdpMigrationSaveResult>;
  ddpMigration(input: FredDdpPageInput & { migrationId: string; section?: 'series' | 'acquisitions' | 'mappings' },
    options?: FredRequestOptions): Promise<FredDdpMigrationView>;
  acquireDdpMigration(input: FredDdpMigrationAcquireInput, options?: FredRequestOptions): Promise<FredDdpMigrationAcquireResult>;
  ddpReceiving(input: FredDdpReceivingInput, options?: FredRequestOptions): Promise<FredDdpReceivingView>;
  publication(publicationId: string, options?: FredRequestOptions): Promise<FredPublication>;
  preview(input: { publicationId: string; query?: string }, options?: FredRequestOptions): Promise<JsonObject>;
  configure(input: FredSelectionInput, options?: FredRequestOptions): Promise<FredConfiguredResult>;
  capture(input: FredJournalInput, options?: FredRequestOptions): Promise<FredCaptureResult>;
  importCapture(input: FredImportInput, options?: FredRequestOptions): Promise<FredCaptureResult>;
  combine(input: FredCombineInput, options?: FredRequestOptions): Promise<FredCombinedResult>;
  select(input: FredCaptureInput, options?: FredRequestOptions): Promise<FredSelectedResult>;
  review(input: FredReviewInput, options?: FredRequestOptions): Promise<FredReviewedResult>;
  publish(input: FredPublishInput, options?: FredRequestOptions): Promise<FredPublishedResult>;
  abandon(input: FredAbandonInput, options?: FredRequestOptions): Promise<FredRevisionResult & { pendingId: string; state: 'ABANDONED' }>;
  startMerchant(input: FredPublicationInput, options?: FredRequestOptions): Promise<FredMerchantRuntime>;
  stopMerchant(input: FredPublicationInput, options?: FredRequestOptions): Promise<{ state: 'STOPPED' }>;
  prepare(input: FredPrepareInput, options?: FredRequestOptions): Promise<FredPreparedPurchase>;
  buy(input: FredIntentInput, options?: FredRequestOptions): Promise<FredPurchaseStatus>;
  recover(input: FredIntentInput, options?: FredRequestOptions): Promise<FredPurchaseStatus>;
  wait(id: string, options?: FredRequestOptions & { timeoutMs?: number; intervalMs?: number }): Promise<FredOperation>;
  file(selection: FredFileSelection, options?: FredFileOptions): Promise<FredDownloadedFile>;
  close(): void;
}
export declare function inspectFredProjectBundle(bundle: unknown): FredBundleIdentity;
export declare function saveFredFile(client: FredWorkspaceClient, selection: FredFileSelection, destination: string,
  options?: FredFileOptions): Promise<FredSavedFile>;
export declare function inspectFredWorkspaceFile(source: string, options?: { expectedSha256?: string }):
  Promise<FredBundleIdentity & { sourceBytes: number; sourceSha256: string }>;
export declare function receiveFredWorkspaceFile(source: string, directory: string, options?: { expectedSha256?: string }):
  Promise<FredBundleIdentity & { sourceBytes: number; sourceSha256: string; received: JsonObject }>;
