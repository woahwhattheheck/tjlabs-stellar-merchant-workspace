// MIT. Remote customer operation and exact original comparison receiving.
import type {
  ODataCollectionComparison, ODataComparisonReviewRequest, ODataComparisonReviewVersion,
  ODataComparisonCounts, ODataComparisonLimits, ODataCollectionComparisonSelection,
  ODataComparisonRows, ODataComparisonEntityStatus,
  comparisonAnalysisMapping
} from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/odata/live/collection-comparison.mjs';
import type { ODataCollectionNamedFile } from '../../stellar/scf-starforge-20261009/sf30-seller-sdk/odata/live/collection.mjs';
import type { OriginalMerchantClient, MerchantConnection, DownloadProgress } from './odata-collection-client.mjs';
export type { OriginalMerchantClient, MerchantConnection, DownloadProgress };

export const ODATA_COMPARISON_DOWNLOAD_SCHEMA: 'stellar-forge.odata-comparison-download.v1';
export const ODATA_COMPARISON_RECEIVING_SCHEMA: 'stellar-forge.odata-comparison-receiving.v1';
export const ODATA_COMPARISON_REVIEW_REQUEST_SCHEMA: 'stellar-forge.odata-comparison-review-request.v1';
export interface ServiceSelection { workspace: string; liveServiceId: string }
export interface ComparisonSelection extends ServiceSelection { comparisonId: string }
export interface ComparisonEditionSelection extends ComparisonSelection { editionId: string }
export interface Page { offset: number; limit: number; total: number; nextOffset: number | null }
export interface PageOptions { offset?: number; /** 1–100 original records. */ limit?: number }
export interface SourceFile {
  path: string; bytes: number; sha256: string; contentType: string; role?: string;
}
export interface ComparisonSourceDocument {
  schema: 'stellar-forge.analysis-source-document.v1'; complete: true; format: 'csv'; title: string;
  document: SourceFile; originals: SourceFile[]; provenance: Record<string, unknown>;
}
export interface SourceSummary {
  schema: ComparisonSourceDocument['schema']; title: string; format: 'csv'; sourceSha256: string;
  comparisonSha256: string; reviewSha256: string; editionId: string;
  files: number; bytes: number; originalPackets: number;
}
export interface RemoteFileReference {
  path: string; bytes: number; sha256: string; tool: 'merchant_odata_file';
  arguments: {
    workspace: string; kind: 'live-comparison'; id: string; recordId: string;
    filename: string; expectedSha256: string;
  };
}
export interface CompleteComparisonBrief {
  id: string; status: 'COMPLETE'; title: string; manifestSha256: string;
  before: ODataCollectionComparisonSelection['before']; after: ODataCollectionComparisonSelection['after'];
  sameQuery: boolean; sameProjection: boolean; counts: ODataComparisonCounts; reviewRevision: number;
}
export interface InterruptedComparisonBrief {
  id: string; status: 'INCOMPLETE'; selection: ODataCollectionComparisonSelection | null;
  beforeSha256: string; afterSha256: string;
  sourceCollections: { before: string | null; after: string | null };
}
export interface RemoteComparison extends
  Omit<ODataCollectionComparison, 'directory' | 'files' | 'reviews'>, ServiceSelection {
  id: string;
  files: ODataCollectionNamedFile[];
  retainedFiles?: ODataCollectionNamedFile[];
  reviews: { revision: number; current: ODataComparisonReviewVersion[]; history: ODataComparisonReviewVersion[] };
  pagination: Record<string, Page>;
  /** Present on original inspection; creation and receiving return native selection hashes instead. */
  sourceCollections?: { before: string | null; after: string | null };
}
export interface CreateComparisonOptions extends MerchantConnection, ComparisonSelection {
  beforeCollectionId: string; afterCollectionId: string;
  expectedBeforeSha256: string; expectedAfterSha256: string;
  title: string; fields?: string[]; limits?: Partial<ODataComparisonLimits>;
}
export interface RemoteRows extends ComparisonSelection, ODataComparisonRows {}
export type ReviewOptions = MerchantConnection & ComparisonSelection & (
  { request: ODataComparisonReviewRequest; reviewRequest?: never } |
  { request?: never; /** Original pinned host comparisonReviews alias. */ reviewRequest: string }
);
export interface ReviewResult extends ComparisonSelection {
  comparisonSha256: string; reviewRevision: number; review: ODataComparisonReviewVersion; reused: boolean;
  selectedInput: { alias: string; bytes: number; sha256: string } | null;
}
export interface PublicationResult extends ComparisonEditionSelection {
  comparisonSha256: string; reviewRevision: number; bytes: number; sha256: string;
  manifest: RemoteFileReference; files: RemoteFileReference[];
}
export type RemoteRestoreOptions = MerchantConnection & ComparisonSelection & { expectedSha256: string } & (
  { sourceDocument: string; sourceWorkspace?: never; sourceLiveServiceId?: never; sourceComparisonId?: never; sourceEditionId?: never } |
  { sourceDocument?: never; sourceWorkspace?: string; sourceLiveServiceId?: string; sourceComparisonId: string; sourceEditionId: string }
);
export type SelectedRestoreSource =
  { sourceDocument: string; sha256: string } |
  { sourceWorkspace: string; sourceLiveServiceId: string; sourceComparisonId: string; sourceEditionId: string; sha256: string };
export interface RemoteRestoreResult extends RemoteComparison {
  restoredFrom: { sha256: string; reviewRevision: number }; reused: boolean; selectedSource: SelectedRestoreSource;
}
export type AnalysisRegistration =
  { source?: never; sourceRevision?: never } |
  { source: string; sourceRevision: number };
export type ComparisonAnalysisInput = ReturnType<typeof comparisonAnalysisMapping>;
export interface InspectSourceResult extends ComparisonEditionSelection {
  schema: typeof ODATA_COMPARISON_DOWNLOAD_SCHEMA; state: 'INSPECTED'; endpoint: string;
  comparisonSha256: string; source: SourceSummary; document: ComparisonSourceDocument;
  analysisInput?: ComparisonAnalysisInput;
}
export type SourceOptions = MerchantConnection & ComparisonEditionSelection & {
  /** Exact published source.json digest, separate from editionId. */
  expectedSha256: string;
} & AnalysisRegistration;
export type DownloadOptions = SourceOptions & {
  directory: string;
  /** 1–196608 bytes; uses the maintained retained-file reader. */
  chunkSize?: number;
  onProgress?: (event: DownloadProgress) => void | Promise<void>;
};
export interface DownloadResult extends ComparisonEditionSelection {
  schema: typeof ODATA_COMPARISON_DOWNLOAD_SCHEMA; state: 'COMPLETE'; endpoint: string; directory: string;
  sourceManifest: string; sourceSha256: string; exportId: string; manifestSha256: string;
  comparisonSha256: string; reviewSha256: string; title: string; format: 'csv';
  files: number; bytes: number; resumed: boolean; resumedBytes: number;
}
export interface InspectDownloadOptions {
  directory: string; expectedSha256?: string; editionId?: string; signal?: AbortSignal;
}
export interface InspectDownloadResult extends ComparisonEditionSelection {
  schema: typeof ODATA_COMPARISON_DOWNLOAD_SCHEMA; state: 'COMPLETE'; endpoint: string;
  directory: string; sourceManifest: string; source: SourceSummary;
}
export type ComparisonSummary = Pick<ODataCollectionComparison,
  'schema' | 'directory' | 'status' | 'engine' | 'selectionSha256' | 'selection' | 'manifestSha256' |
  'counts' | 'analysisProjection' | 'reviews' | 'analysis'> & {
    restoredFrom?: { sha256: string; reviewRevision: number }; reused?: boolean;
  };
export interface ReceiveOptions {
  directory: string; comparisonDirectory: string; expectedSha256: string;
  editionId?: string; signal?: AbortSignal;
}
export interface ReceivingResult extends ComparisonEditionSelection {
  schema: typeof ODATA_COMPARISON_RECEIVING_SCHEMA; state: 'COMPLETE'; endpoint: string;
  downloadDirectory: string; sourceSha256: string; comparison: ComparisonSummary;
}

export function listMerchantODataComparisons(options: MerchantConnection & ServiceSelection & PageOptions): Promise<
  ServiceSelection & { comparisons: Array<CompleteComparisonBrief | InterruptedComparisonBrief>; page: Page }
>;
export function inspectMerchantODataComparison(options: MerchantConnection & ComparisonSelection & PageOptions): Promise<RemoteComparison>;
export function listMerchantODataComparisonEditions(options: MerchantConnection & ComparisonSelection & PageOptions): Promise<
  ComparisonSelection & { comparisonSha256: string; reviewRevision: number;
    editions: Array<{ editionId: string; bytes: number; sha256: string; manifest: RemoteFileReference }>;
    /** Pagination counts original retained-file entries, including non-edition files. */
    page: Page; pageKind: 'retainedFiles';
  }
>;
export function createMerchantODataComparison(options: CreateComparisonOptions): Promise<RemoteComparison>;
export function readMerchantODataComparisonRows(options: MerchantConnection & ComparisonSelection & PageOptions & {
  kind?: 'cells' | 'entities'; status?: ODataComparisonEntityStatus;
}): Promise<RemoteRows>;
export function reviewMerchantODataComparison(options: ReviewOptions): Promise<ReviewResult>;
export function publishMerchantODataComparison(options: MerchantConnection & ComparisonSelection & {
  expectedRevision: number;
}): Promise<PublicationResult>;
export function restoreMerchantODataComparison(options: RemoteRestoreOptions): Promise<RemoteRestoreResult>;
export function inspectMerchantODataComparisonSource(options: SourceOptions): Promise<InspectSourceResult>;
export function downloadMerchantODataComparison(options: DownloadOptions): Promise<DownloadResult>;
export function inspectODataComparisonDownload(options: InspectDownloadOptions): Promise<InspectDownloadResult>;
export function receiveODataComparisonDownload(options: ReceiveOptions): Promise<ReceivingResult>;
export function fetchODataComparison(options: DownloadOptions & { comparisonDirectory: string }): Promise<{
  schema: typeof ODATA_COMPARISON_RECEIVING_SCHEMA; state: 'COMPLETE';
  download: DownloadResult; receiving: ReceivingResult;
}>;
export function inspectReceivedODataComparison(options: { directory: string; replay?: boolean }): Promise<ComparisonSummary>;
export function readReceivedODataComparisonRows(options: {
  directory: string; kind?: 'cells' | 'entities'; offset?: number;
  /** Original native reader accepts 1–500 rows. */ limit?: number; status?: ODataComparisonEntityStatus;
}): Promise<ODataComparisonRows>;
export function receivedODataComparisonAnalysisMapping(options: {
  directory: string; source: string; sourceRevision: number;
}): Promise<{
  comparisonSha256: string; analysis: ODataCollectionComparison['analysis']; input: ComparisonAnalysisInput;
}>;
