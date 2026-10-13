// SPDX-License-Identifier: MIT
export const ATLAS_WORKSPACE_SCHEMA: 'stellar-forge.sf61.workspace.v1';
export type OriginalListing = Record<string, unknown> & {
  resource?: string | { url?: string; [key: string]: unknown };
  accepts?: Array<Record<string, unknown>>;
  extensions?: Record<string, unknown>;
};
export interface CaptureFilters {
  type?: 'http' | 'mcp';
  payTo?: string;
  network?: string;
  scheme?: string;
  asset?: string;
  extensions?: string;
}
export interface CaptureSearchInput {
  captureId: string;
  query?: string;
  filters?: CaptureFilters;
  page?: number;
  pageSize?: number;
  snapshotId?: string | null;
}
export interface CaptureSearchContinuation {
  captureId: string;
  query: string;
  filters: CaptureFilters;
  page: number;
  pageSize: number;
  snapshotId: string;
}
export interface OriginalCapturePage {
  pageFile: string;
  sha256: string;
  bytes: number;
  rows: number;
  offset: number | null;
  reportedTotal: number | null;
  partialResults: boolean | null;
}
export interface CaptureCoverage {
  captureStatus: string;
  nativeStatus: string | null;
  expectedPages: number;
  receivedPages: number;
  missingPages: string[];
  expectedRows: number;
  receivedRows: number;
  reportedTotal: number | null;
  captureComplete: boolean;
  allReportedRowsPresent: boolean | null;
  totalChanged: boolean;
  sourceRequest: Record<string, unknown> | null;
  observation: 'RETAINED_PAGES_NOT_AN_ATOMIC_PROVIDER_SNAPSHOT';
}
export interface RetainedCapture {
  id: string;
  captureId: string;
  name: string;
  kind: 'NATIVE_CAPTURE' | 'SINGLE_PAGE';
  status: 'RECEIVING' | 'READY';
  source: string | null;
  rows: number;
  pages: number;
  nativeStatus?: string;
  reportedTotal?: number | null;
  sessionSha256?: string;
  manifestSha256?: string;
  updatedAt: string;
  receivedAt: string;
  [key: string]: unknown;
}
export interface CaptureSearchResult {
  schema: 'stellar-forge.sf61.capture-search.v1';
  capture: RetainedCapture;
  snapshotId: string;
  sourcePages: OriginalCapturePage[];
  coverage: CaptureCoverage;
  search: { query: string; filters: CaptureFilters; order: 'relevance' | 'source';
    indexedRows: number; unindexedRows: number; matchingRows: number };
  offers: Array<{ pageFile: string; pageSha256: string; row: number; catalogKey: string | null;
    searchable: boolean; rank: number | null; listing: OriginalListing; matchingAcceptIndexes: number[];
    indexingError?: { code: string; message: string } }>;
  pagination: { page: number; pageSize: number; total: number; nextPage: number | null };
  continuation: CaptureSearchContinuation | null;
}
export interface AtlasRequest {
  intentId: string;
  url: string;
  method: 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers: Record<string, string>;
  responseOut?: string;
  ticketHeader?: string;
}
export interface SaveSelectionInput {
  captureId: string;
  pageFile: string;
  row: number;
  accept: number;
  label: string;
  selectionId?: string;
}
export interface AtlasSelection {
  id: string;
  selectionId: string;
  captureId: string;
  pageFile: string;
  row: number;
  accept: number;
  label: string;
  resource: string;
  revision: number;
  stage: 'SELECTED' | 'PREPARED' | 'HANDOFF';
  updatedAt: string;
  request: AtlasRequest | null;
  listing: OriginalListing;
  acceptedTerms: Record<string, unknown>;
  inputs: { bodyPresent: boolean; bodyBytes: number; bodySha256: string | null; ticketPresent: boolean };
  prepared: { config: Record<string, unknown>; configText: string; configSha256: string;
    sourceFileSha256: string; originalConfigSha256: string | null; configPath: string | null;
    ticket: Record<string, unknown> | null } | null;
  handoff: { path: string; bytes: number; sha256: string; acceptIndex: number; intentId: string;
    value: Record<string, unknown>; text: string } | null;
  [key: string]: unknown;
}
export interface AtlasSummary {
  schema: typeof ATLAS_WORKSPACE_SCHEMA;
  id: string;
  directory: string;
  createdAt: string;
  relocated: boolean;
  captures: RetainedCapture[];
  selections: Array<Pick<AtlasSelection, 'id' | 'selectionId' | 'label' | 'revision' | 'stage' |
    'captureId' | 'resource' | 'updatedAt'> & { intentId: string | null }>;
}
export interface AtlasWorkspace {
  readonly directory: string;
  summary(): Promise<AtlasSummary>;
  beginCapture(input: { name: string; sessionText: string; manifestText: string }): Promise<{
    captureId: string; id: string; status: string; missingPages: string[]; pages: number }>;
  putCapturePage(input: { captureId: string; file: string; text: string }): Promise<{
    captureId: string; file: string; sha256: string; status: 'RECEIVED' }>;
  finishCapture(input: { captureId: string }): Promise<RetainedCapture>;
  receivePage(input: { name: string; pageText: string }): Promise<RetainedCapture>;
  capture(input: CaptureSearchInput): Promise<CaptureSearchResult>;
  capturePages(input: CaptureSearchInput): AsyncGenerator<CaptureSearchResult, void, unknown>;
  saveSelection(input: SaveSelectionInput): Promise<AtlasSelection>;
  selection(input: { selectionId: string }): Promise<AtlasSelection>;
  prepareSelection(input: { selectionId: string; revision: number; request: AtlasRequest;
    bodyText?: string | null; ticketText?: string | null }): Promise<AtlasSelection>;
  createHandoff(input: { selectionId: string; revision: number }): Promise<AtlasSelection>;
  snapshotFiles(): AsyncGenerator<{ path: string; bytes: Uint8Array }, void, unknown>;
  close(): Promise<void>;
}
/** Opens the original private single-writer store. The caller owns close(). */
export function openAtlasWorkspace(input: { directory: string; create?: boolean }): Promise<AtlasWorkspace>;
